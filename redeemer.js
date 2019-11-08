let Application = (function(){
  "use strict";

  const sessionExpiration = 1000 * 60 * 60 * 24,
        getNextExpiration = function(){
          let expiration = new Date();
          expiration.setTime(expiration.getTime() + sessionExpiration);
          return expiration;
        },
        onBeforeHeaders = {
          "Referer": "https://borderlands.com/en-US/vip/",
          "Origin": "https://borderlands.com"
        },
        knownVipCodeTypes = ["diamond", "vault", "email", "creator", "boost"],
        maximumRetries = 10,
        retryWait = 1000,
        parseJson = function(string){
          try {
            return JSON.parse(string);
          } catch( e ) {
            console.error(`Could not parse JSON string ${string}.`);
            console.error(e);
            throw e;
          }
        },
        shiftSources = {
          "orcz": {
            "url": "http://orcz.com/Borderlands_3:_Shift_Codes",
            "codeTableIndex": 4
          }
        },
        vipSources = {
          "reddit": {
            "url": "https://www.reddit.com/r/borderlands3/comments/bxgq5p/borderlands_vip_program_codes/",
            "typeTableIndex": 3,
            "validTableIndex": 2,
            "codeTableIndex": 0
          }
        };

  chrome.webRequest.onBeforeSendHeaders.addListener(
    function( details ){
      let foundHeaders = [];

      for(let headerName in details.requestHeaders){
        for(let targetHeaderName in onBeforeHeaders){
          if(foundHeaders.indexOf(targetHeaderName) !== -1){ 
            continue;
          }
          if(details.requestHeaders[headerName].name.toLowerCase() === targetHeaderName.toLowerCase()){
            foundHeaders.push(targetHeaderName);
            details.requestHeaders[headerName].value = onBeforeHeaders[targetHeaderName];
          }
        }
      }

      for(let headerName in onBeforeHeaders){
        if(foundHeaders.indexOf(headerName) === -1){
          details.requestHeaders.push({
            "name": headerName,
            "value": onBeforeHeaders[headerName]
          });
        }
      }

      return { requestHeaders:details.requestHeaders };
    },{
      urls: [ 
        "https://api.2k.com/*",
        "https://2kgames.crowdtwist.com/*"
      ]
    }, [
      "requestHeaders",
      "blocking"
    ]
  );

  let noPromise = function(returnValue){
        return new Promise((resolve) => resolve(returnValue));
      },
      caughtPromise = function(promise){
        return new Promise(function(resolve){
          promise.then(function(result){
            resolve({"success": true, "result": result});
          }).catch(function(result){
            resolve({"success": false, "result": result});
          });
        });
      },
      caughtPromises = function(){
        return Promise.all(Array.from(arguments).map((argument) => caughtPromise(argument)));
      };

  class MutexLock {
    constructor( ){
      this.holder = Promise.resolve();
    }

    acquire(caller){
      let awaitResolve,
          temporaryPromise = new Promise(resolve => {
            awaitResolve = () => resolve();
          }),
          returnValue = this.holder.then(() => awaitResolve);
      this.holder = temporaryPromise;
      return returnValue;
    }
  };

  class Application {
    constructor( ){
      this.storageLock = new MutexLock();
      this.readWriteLock = new MutexLock();
    }

    getPersistentStorage(storageKey, defaultValue){
      let application = this;
      return new Promise(function(resolve, reject){
        application.storageLock.acquire().then(function(release){
          try {
            chrome.storage.sync.get(storageKey, function(result){
              release();
              if(result === undefined || (typeof result === "object" && Object.getOwnPropertyNames(result).length === 0)){
                if(defaultValue === undefined){
                  reject("No stored value for key " + storageKey + ".");
                } else {
                  resolve(defaultValue);
                }
              } else {
                resolve(result[storageKey]);
              }
            });
          } catch(e) {
            reject(e);
          }
        });
      });
    };

    setPersistentStorage(storageKey, storageValue){
      let application = this;
      return new Promise(function(resolve, reject){
        application.storageLock.acquire().then(function(release){
          let storageObject = {};
          storageObject[storageKey] = storageValue;
          chrome.storage.sync.set(storageObject, function(){ release(); resolve(); });
        });
      });
    };

    getTemporaryStorage(storageKey, defaultValue){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getPersistentStorage(storageKey).then(function(result){
          if(!result.hasOwnProperty("expiry") || result.expiry < new Date()){
            reject();
          } else {
            resolve(result.value);
          }
        }).catch(function(e){
          if(defaultValue !== undefined){
            resolve(defaultValue);
          } else {
            reject(e);
          }
        });
      });
    };

    setTemporaryStorage(storageKey, storageValue){
      return this.setPersistentStorage(storageKey, { value: storageValue, expiry: getNextExpiration() });
    };

    login( ){
      let application = this;

      return new Promise(function(resolve, reject){
        application.getPersistentStorage("username").then(function(username){
          application.getPersistentStorage("password").then(function(password){
            let getSessionHeader = function(request){
              let sessionId = request.getResponseHeader("X-Session-Set");

              if(sessionId === null || sessionId === undefined || sessionId === "" ){ 
                reject("Could not retrieve session ID from server.");
              }
              application.setTemporaryStorage("sessionId", sessionId).then(resolve).catch(() => reject("Could not set temporary storage value."));
            };

            application.prepareRequest(
              "POST",
              "https://api.2k.com/borderlands/users/authenticate",
              getSessionHeader,
              ()=>reject("Could not authenticate using provided information.")
            ).then(function(request){
              request.setRequestHeader("Content-Type", "application/json");
              request.send(JSON.stringify({"username": username, "password": password}));
            });
          }).catch(()=>reject("Could not retrieve stored password."));
        }).catch(()=>reject("Could not retrieve stored username."));
      });
    };

    prepareRequest(method, url, callback, errorCallback){
      // This is kept as a promise for consistent usage with prepareGatedRequest.
      return new Promise(function(resolve){
        console.log("Preparing request to", method, url);
        callback = callback || function(){};
        errorCallback = errorCallback || function(){};

        let xhr = new XMLHttpRequest();

        xhr.addEventListener("load", function(){
          console.log("Reponse from", method, url, "status code", this.status);
          if(this.status >= 400){
            errorCallback(this);
          } else {
            callback(this);
          }
        });

        xhr.addEventListener("error", errorCallback);
        xhr.open(method, url);

        resolve(xhr);
      });
    };

    prepareGatedRequest(method, url, callback, errorCallback){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getTemporaryStorage("sessionId").then(function(sessionId){
          application.prepareRequest(method, url, callback, errorCallback).then(function(xhr){
            xhr.setRequestHeader("X-Session", sessionId);
            resolve(xhr);
          });
        }).catch(function(){
          application.login( ).then(function(){
            application.prepareGatedRequest(method, url, callback, errorCallback).then(resolve).catch(reject);
          }).catch(reject);
        });
      });
    };

    sendRequest(method, url, body){
      let application = this;
      return new Promise(function(resolve, reject){
        application.prepareRequest(method, url, resolve, reject).then(function(xhr){
          xhr.send(body);
        }).catch(reject);
      });
    };

    sendGatedRequest(method, url, body){
      let application = this;
      return new Promise(function(resolve, reject){
        application.prepareGatedRequest(method, url, resolve, reject).then(function(xhr){
          xhr.send(body);
        }).catch(reject);
      });
    };

    getUserInfo( ){
      return this.sendGatedRequest("POST", "https://api.2k.com/borderlands/users/me");
    };

    getPlatforms(){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getUserInfo().then(function(userInfoRequest){
          let userInfo = parseJson(userInfoRequest.responseText),
              borderlandsGameInfo = userInfo.playedGames.filter((game)=>game.title==="oak").shift();

          if(borderlandsGameInfo === undefined){
            reject("Could not find any platform for Borderlands 3.");
          } else {
            resolve(borderlandsGameInfo.platforms);
          }
        }).catch(reject);
      });
    };

    getUsedCodes(){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getPersistentStorage("shift", []).then(function(shift){
          application.getPersistentStorage("vip", []).then(function(vip){
            resolve({
              "shift": shift,
              "vip": vip
            });
          }).catch(reject);
        }).catch(reject);
      });
    };

    getBadCodes(){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getPersistentStorage("bad_shift", []).then(function(shift){
          application.getPersistentStorage("bad_vip", []).then(function(vip){
            resolve({
              "shift": shift,
              "vip": vip
            });
          }).catch(reject);
        }).catch(reject);
      });
    };
    
    getVipWidgetConfiguration(url){
      let application = this;
      return new Promise(function(resolve, reject){
        application.sendGatedRequest(
          "GET", 
          url
        ).then(function(widgetConfigurationRequest){
          let parser = new DOMParser(),
              widgetDocument = parser.parseFromString(widgetConfigurationRequest.responseText, "text/html"),
              scripts = widgetDocument.querySelectorAll("script"),
              scriptConfiguration = null;

          for(let script of scripts){
            let widgetConfPosition = script.innerText.indexOf("window.widgetConf");
            if(widgetConfPosition !== -1){
              let confStartPosition = script.innerText.indexOf("{", widgetConfPosition),
                  confEndPosition = script.innerText.indexOf(";", confStartPosition);
              scriptConfiguration = parseJson(script.innerText.substring(confStartPosition, confEndPosition));
              break;
            }
          }

          if(scriptConfiguration === null){
            reject("Could not get VIP widget configuration.");
          } else {
            resolve(scriptConfiguration);
          }
        }).catch(reject);
      });
    };

    getVipConfiguration(){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getVipWidgetConfiguration("https://2kgames.crowdtwist.com/widgets/t/activity-list/9904/?__locale__=en#2").then(function(scriptConfiguration){
          let configurationEntries = scriptConfiguration.entries.filter((entry) => entry.link.widgetType === "code-redemption");
          Promise.all(configurationEntries.map(function(configurationEntry){
            return application.getVipWidgetConfiguration(`https://2kgames.crowdtwist.com/widgets/t/code-redemption/${configurationEntry.link.widgetId}`);
          })).then(function(configurationEntryResponses){
            for(let i in configurationEntryResponses){
              for(let knownCodeType of knownVipCodeTypes){
                if(configurationEntryResponses[i].activityName.toLowerCase().indexOf(knownCodeType) !== -1){
                  configurationEntryResponses[i].codeType = knownCodeType;
                  break;
                }
              }
            }
            resolve(configurationEntryResponses.filter((response) => response.codeType !== undefined).map(function(response){ return {"codeType": response.codeType, "campaignId": response.campaignId}; }));
          }).catch(reject);
        }).catch(reject);
      });
    };


    getVipCodeInfo(code){
      // No way to get VIP code data at present.
      return new Promise((resolve) => resolve());
    };
    
    getShiftCodeInfo(code){
      let application = this;
      return new Promise(function(resolve, reject){
        application.sendGatedRequest("GET", "https://api.2k.com/borderlands/code/" + code + "/info").then(function(codeRequest){
          resolve(parseJson(codeRequest.responseText));
        }).catch(reject);
      });
    };

    getCodeInfo(codeType, code, platform, campaignId){
      return codeType === "shift" ? this.getShiftCodeInfo(code) : this.getVipCodeInfo(code);
    };

    checkShiftCodeInfo(code, platform, campaignId, codeInfo){
      let application = this,
          platformCode = codeInfo.entitlement_offer_codes.filter((offerCodeInfo) => offerCodeInfo.offer_service === platform).shift();

      return new Promise(function(resolve, reject){
        if(platformCode === undefined){
          reject(`SHiFT Code ${code} not available for platform '${platform}'.`);
        } else if (!platformCode.is_active) {
          reject(`SHiFT Code ${code} is no longer active.`);
        } else {
          application.getBadCodes().then(function(badCodes){
            if(badCodes.shift.indexOf(code) !== -1){
              reject(`SHiFT Code ${code} recognized as invalid code, ignoring.`);
            } else {
              application.getUsedCodes().then(function(usedCodes){
                let usedCode = usedCodes.shift.filter((usedCode) => usedCode.platform === platform && usedCode.code === code).shift();
                if(usedCode !== undefined){
                  console.log(usedCode);
                  reject(`SHiFT Code ${code} already redeemed on ${usedCode.date}`);
                } else {
                  resolve({
                    "code": code,
                    "platform": platform,
                    "date": (new Date()).toLocaleString(),
                    "title": platformCode.offer_title_text,
                    "description": platformCode.offer_description_text
                  });
                }
              }).catch(reject);
            }
          }).catch(reject);
        }
      });
    };

    checkVipCodeInfo(code, platform, campaignId, codeResponse){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getBadCodes().then(function(badCodes){
          if(badCodes.vip.indexOf(code) !== -1){
            reject(`VIP Code ${code} recognized as invalid code, ignoring.`);
          } else {
            application.getUsedCodes().then(function(usedCodes){
              let usedCode = usedCodes.shift.filter((usedCode) => usedCode.code === code).shift();
              if(usedCode !== undefined){
                reject(`VIP Code ${code} already redeemed on ${usedCode.date}`);
              } else {
                resolve({
                  "code": code,
                  "date": (new Date()).toLocaleString()
                });
              }
            }).catch(reject);
          }
        }).catch(reject);
      });
    };

    checkCodeInfo(codeType, code, platform, campaignId, codeInfo){
      return codeType === "shift" ? this.checkShiftCodeInfo(code, platform, campaignId, codeInfo) : this.checkVipCodeInfo(code, platform, campaignId, codeInfo);
    };

    redeemShiftCode(code, platform, codeData){
      let application = this;
      return new Promise(function(resolve, reject){
        application.sendGatedRequest(
          "POST", 
          "https://api.2k.com/borderlands/code/" + code + "/redeem/" + platform
        ).then(function(redeemResponse){
          let redemptionJobData = parseJson(redeemResponse.responseText),
              jobId = redemptionJobData.job_id;

          if(jobId === undefined){
            reject("Could not parse response from 2K servers.");
          } else {
            let checkRedemption = function(retries){
              return new Promise(function(resolve, reject){
                let handleJobError = function(jobData){
                  let error;
                  if(jobData.error !== undefined){
                    error = jobData.error;
                  } else if (jobData.errors !== undefined && jobData.errors.length > 0 ){
                    error = jobData.errors[0];
                  } else {
                    error = "Unknown error.";
                  }

                  if(error === "CODE_ALREADY_REDEEMED"){
                    application.addUsedCode("shift", codeData);
                    reject(`Code ${code} already redeemed for platform '${platform}'.`);
                  } else if(retries < maximumRetries){
                    setTimeout(function(){
                      checkRedemption(++retries).then(resolve).catch(reject);
                    }, retryWait);
                  } else {
                    reject("Code redemption timed out.");
                  }
                };

                application.sendGatedRequest(
                  "GET", 
                  "https://api.2k.com/borderlands/code/" + code + "/job/" + jobId
                ).then(function(jobResponse){
                  let jobData = parseJson(jobResponse.responseText);
                  if(!jobData.success){
                    handleJobError(jobData);
                  } else {
                    resolve();
                  }
                }).catch(function(errorRequest){
                  handleJobError(parseJson(errorRequest.responseText));
                });
              });
            };
            setTimeout(function(){
              checkRedemption(0).then(resolve).catch(reject);
            }, retryWait);
          }
        }).catch(reject);
      });
    };

    redeemVipCode(code, platform, campaignId, codeData){
      let application = this;

      return new Promise(function(resolve, reject){
        let checkRejectionReason = function(request){
          if(request.status === 400) {
            reject(`VIP Code ${code} already redeemed or no longer active.`);
          } else if(request.status >= 500){
            application.addBadCode("vip", code);
            reject(`VIP Code ${code} invalid, adding to bad code list.`);
          } else {
            reject(`Recieved status code ${request.status} from request.`);
          }
        };

        let resolveRequest = function(request){
          codeData.description = parseJson(request.responseText).message;
          resolve();
        };

        application.prepareGatedRequest(
          "POST",
          `https://2kgames.crowdtwist.com/code-redemption-campaign/redeem?cid=${campaignId}`,
          resolveRequest,
          checkRejectionReason
        ).then(function(request){
          request.setRequestHeader("Content-Type", "application/json");
          request.send(JSON.stringify({"code": code}));
        }).catch(reject);
      });
    };

    redeemCode(codeType, code, platform, campaignId, platforms){
      let application = this;

      return new Promise(function(resolve, reject){
        let platformPromise;
        if(platforms === undefined){
          platformPromise = application.getPlatforms();
        } else {
          platformPromise = noPromise(platforms);
        }
        platformPromise.then(function(platforms){
          if(platform !== null && platforms.map((platform) => platform.service).indexOf(platform) === -1){
            reject(`Couldn't find a Borderlands 3 game registered for platform '${platform}'.`);
          } else {
            application.getCodeInfo(codeType, code, platform, campaignId).then(function(codeInfo){
              application.checkCodeInfo(codeType, code, platform, campaignId, codeInfo).then(function(codeData){
                let redeemCodePromise = codeType === "shift" ? 
                  application.redeemShiftCode(code, platform, codeData) : 
                  application.redeemVipCode(code, platform, campaignId, codeData);

                redeemCodePromise.then(function(){
                  application.addUsedCode(codeType, codeData);
                  resolve();
                }).catch(reject);
              }).catch(reject);
            }).catch(reject);
          }
        }).catch(reject);
      });
    };

    addUsedCode(codeType, code){
      let application = this;
      return new Promise(function(resolve, reject){
        application.readWriteLock.acquire().then(function(release){
          let resolveAll = function(retval){ release(); resolve(retval); },
              rejectAll = function(retval){ release(); reject(retval); };
          application.getPersistentStorage(codeType, []).then(function(codes){
            application.setPersistentStorage(codeType, codes.concat([code])).then(resolveAll).catch(rejectAll);
          }).catch(rejectAll);
        });
      });
    };

    addBadCode(codeType, code){
      let application = this;
      return new Promise(function(resolve, reject){
        application.readWriteLock.acquire().then(function(release){
          let resolveAll = function(retval){ release(); resolve(retval); },
              rejectAll = function(retval){ release(); reject(retval); };
          application.getPersistentStorage(`bad_${codeType}`, []).then(function(codes){
            application.setPersistentStorage(`bad_${codeType}`, codes.concat([code])).then(resolveAll).catch(rejectAll);
          }).catch(reject);
        });
      });
    };

    resetUsedCodes(){
      let application = this;
      return Promise.all(["shift", "vip", "bad_shift", "bad_vip"].map((codeType) => application.setPersistentStorage(codeType, [])));
    };

    getShiftCodes(shiftSource){
      let application = this;
      return new Promise(function(resolve, reject){
        if(!shiftSources.hasOwnProperty(shiftSource)){
          reject(`Unknown SHiFT Source ${shiftSource}.`);
        } else {
          application.sendRequest("GET", shiftSources[shiftSource].url).then(function(request){
            switch(shiftSource){
              case "orcz":
                let parser = new DOMParser(),
                    codeDocument = parser.parseFromString(request.responseText, "text/html"),
                    codeTable = codeDocument.querySelector(".wikitable"),
                    codeTableRows = codeTable.querySelectorAll("tr"),
                    codeRowArray = Array.from(codeTableRows).slice(1),
                    codes = codeRowArray.map(function(codeTableRow){
                      let codeTableCells = Array.from(codeTableRow.querySelectorAll("td"));
                      return codeTableCells[shiftSources.orcz.codeTableIndex].innerText;
                    });
                resolve(codes);
                break;
            }
          }).catch((request) => `Received status code ${request.status} from request.`);
        }
      });
    };

    getVipCodes(vipSource){
      let application = this;
      return new Promise(function(resolve, reject){
        if(!vipSources.hasOwnProperty(vipSource)){
          reject(`Unknown VIP Source ${vipSource}.`);
        } else {
          application.sendRequest("GET", vipSources[vipSource].url).then(function(request){
            switch(vipSource){
              case "reddit":
                let parser = new DOMParser(),
                    codeDocument = parser.parseFromString(request.responseText, "text/html"),
                    codeTable = codeDocument.querySelector("[data-test-id='post-content'] tbody"),
                    codeTableRows = codeTable.querySelectorAll("tr"),
                    codeRowArray = Array.from(codeTableRows),
                    codes = codeRowArray.map(function(codeTableRow){
                      let codeTableCells = Array.from(codeTableRow.querySelectorAll("td"));
                      return {
                        "type": codeTableCells[vipSources.reddit.typeTableIndex].innerText.toLowerCase(),
                        "code": codeTableCells[vipSources.reddit.codeTableIndex].innerText,
                        "valid": !(codeTableCells[vipSources.reddit.validTableIndex].innerText.toLowerCase().startsWith("n"))
                      };
                    }).filter((code) => code.valid);
                resolve(codes);
                break;
            }
          }).catch((request) => `Received status code ${request.status} from request.`);
        }
      });
    };

    executeAutoShift(){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getPersistentStorage("auto_shift_source", Object.getOwnPropertyNames(shiftSources)[0]).then(function(shiftSource){
          application.getShiftCodes(shiftSource).then(function(shiftCodes){
            application.getPlatforms().then(function(platforms){
              application.getPersistentStorage("auto_shift_platform", platforms[0].service).then(function(chosenPlatform){
                console.log("Redeeming", shiftCodes.length, "SHiFT codes for platform", chosenPlatform);
                caughtPromises.apply(null, shiftCodes.map((shiftCode) => application.redeemCode("shift", shiftCode, chosenPlatform, null, platforms))).then(resolve);
              }).catch(reject);
            }).catch(reject);
          }).catch(reject);
        }).catch(reject);
      });
    };

    executeAutoVip(){
      let application = this;
      return new Promise(function(resolve, reject){
        application.getPersistentStorage("auto_vip_source", Object.getOwnPropertyNames(vipSources)[0]).then(function(vipSource){
          application.getVipCodes(vipSource).then(function(vipCodes){
            application.getVipConfiguration().then(function(vipConfiguration){
              application.getPlatforms().then(function(platforms){
                let campaignIds = vipConfiguration.reduce(function(acc, item){ acc[item.codeType] = item.campaignId; return acc; }, {}),
                    filteredCodes = vipCodes.filter((vipCode) => Object.getOwnPropertyNames(campaignIds).indexOf(vipCode.type) !== -1);

                if(filteredCodes.length !== vipCodes.length){
                  console.log("Ignoring", vipCodes.length - filteredCodes.length, "VIP Codes due to invalid type.");
                }
                console.log("Redeeming", filteredCodes.length, "VIP Codes.");
                caughtPromises.apply(null, filteredCodes.map((filteredCode) => application.redeemCode("vip", filteredCode.code, null, campaignIds[filteredCode.type], platforms))).then(resolve);
              }).catch(reject);
            }).catch(reject);
          }).catch(reject);
        }).catch(reject);
      });
    };

    displayNotification(message){
      chrome.notifications.create("Vault Key", {
        "title": "Borderlands™ 3 SHiFT & VIP Redemption",
        "iconUrl": "images/vault-key-48.png",
        "type": "basic",
        "message": message
      });
    };

    displayError(message){
      if(message instanceof XMLHttpRequest){
        message = message.responseText;
      } else if (typeof message === "object"){
        try {
          message = JSON.stringify(message);
        } catch(e) {
          message = `${message}`;
        }
      }
      this.displayNotification(message);
    };

    displayStartupError(message){
      let application = this;
      return function(){
        application.displayError(`Could not get your 2K user information, visit the options page to check configuration. The error was: ${message}`);
      };
    };
  };

  return new Application( );
})();
