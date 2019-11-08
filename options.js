(function(application){
  "use strict";

  let inputNodes = document.querySelector("div#account_inputs").querySelectorAll("input"),
      preferenceInputNodes = document.querySelector("div#preference_inputs").querySelectorAll("input"),
      shiftPlatformInput = document.querySelector("select#auto_shift_platform"),
      shiftCodeInput = document.querySelector("input#shift_code"),
      redeemShiftCode = document.querySelector("input#redeem_shift_code"),
      autoShiftCode = document.querySelector("input#auto_shift"),
      autoVipCode = document.querySelector("input#auto_vip"),
      updateButton = document.querySelector("input#update"),
      resetButton = document.querySelector("input#reset"),
      resetUsedCodesButton = document.querySelector("input#reset_redeemed"),
      errorNode = document.querySelector("div#errors"),
      codesNode = document.querySelector("div#used_codes"),
      codeInputNode = document.querySelector("div#code_inputs"),
      displayError = function(errorMessage){
        errorNode.innerText = errorMessage;
      },
      displayLoginError = function(errorMessage){
        displayError(errorMessage);
        codesNode.innerHTML = "<div class='code error'>Used codes will display when successfully logged in.</div>";
      },
      displayUserData = function(userInfo){
        errorNode.innerText = "";
        codesNode.innerHTML = "<h2>Code Redemption History</h2>";

        let usedCodes = userInfo.usedCodes.shift.map(function(usedCode){
          usedCode.type = "SHiFT";
          return usedCode;
        }).concat(userInfo.usedCodes.vip.map(function(usedCode){
          usedCode.type = "VIP";
          return usedCode;
        }));

        usedCodes = usedCodes.sort((a, b) => a.date - b.date);

        if(usedCodes.length === 0){
          codesNode.innerHTML += "<div class='code'>Used codes will display here once they've been redeemed.</div>";
        }

        for(let usedCode of usedCodes){
          let codeNode = document.createElement("div"),
              codeTitle = document.createElement("h3"),
              codeRedeemed = document.createElement("h4");

          codeNode.classList.add("code");

          codeTitle.innerText = `${usedCode.type}: ${usedCode.code}`;
          if(usedCode.platform){
            codeTitle.innerText += ` (${usedCode.platform.toUpperCase()})`;
          }
          codeRedeemed.innerText = `Code redeemed ${usedCode.date}`;

          codeNode.appendChild(codeTitle);
          codeNode.appendChild(codeRedeemed);

          if(usedCode.description){
            let codeDescription = document.createElement("p");
            codeDescription.innerText = usedCode.description;
            codeNode.appendChild(codeDescription);
          }

          codesNode.appendChild(codeNode);
        }

        shiftPlatformInput.innerHTML = "";

        for(let platform of userInfo.platforms){
          let option = document.createElement("option");
          option.setAttribute("value", platform.service);
          option.innerText = platform.service;
          shiftPlatformInput.appendChild(option);
        }

        application.getPersistentStorage("auto_shift_platform", userInfo.platforms[0].service).then(function(selectedPlatform){
          shiftPlatformInput.value = selectedPlatform;
        });
      },
      revertUserData = function(){
        for(let inputNode of inputNodes){
          application.getPersistentStorage(inputNode.getAttribute("name")).then(function(result){
            inputNode.value = result;
          }).catch(displayError);
        }
      },
      getUserData = function(){
        return new Promise(function(resolve, reject){
          application.getUserInfo().then(function(userInfoRequest){
            application.getUsedCodes().then(function(usedCodes){
              application.getPlatforms().then(function(platforms){
                resolve({"userInfo": JSON.parse(userInfoRequest.responseText), "usedCodes": usedCodes, "platforms": platforms});
              }).catch(reject);
            }).catch(reject);
          }).catch(reject);
        });
      },
      updateUserData = function(){
        Promise.all(Array.from(inputNodes).map(function(inputNode){
          return application.setPersistentStorage(inputNode.getAttribute("name"), inputNode.value);
        })).then(function(){
          application.login().then(function(){
            chrome.runtime.sendMessage({"data": "loginUpdated"});
            getUserData().then(displayUserData).catch(displayError);
          }).catch(displayLoginError);
        }).catch(displayError);
      };

  for(let preferenceInputNode of preferenceInputNodes){
    preferenceInputNode.addEventListener("change", function(){
      application.setPersistentStorage(perferenceInputNode.getAttribute("name"), preferenceInputNode.value);
    });

    application.getPersistentStorage(preferenceInputNode.getAttribute("name")).then(function(value){
      preferenceInputNode.value = value;
    }).catch(displayError);
  }


  resetButton.addEventListener("click", revertUserData);
  updateButton.addEventListener("click", updateUserData);
  resetUsedCodesButton.addEventListener("click", function(){
    if(confirm("Remove all code history?")){
      application.resetUsedCodes().then(updateUserData);
    }
  });
  
  revertUserData();
  getUserData().then(displayUserData).catch(displayLoginError);

  redeemShiftCode.addEventListener("click", function(){
    application.displayNotification("Redeeming SHiFT Code...");
    application.redeemCode("shift", shiftCodeInput.value, shiftPlatformInput.value).then(function(){
      application.displayNotification("SHiFT Code redeemed!");
      shiftCodeInput.value = "";
      getUserData.then(displayUserData).catch(application.displayError);
    }).catch(function(error){
      if(error instanceof XMLHttpRequest){
        try {
          let responseJson = JSON.parse(error.responseText);
          if(responseJson.error !== undefined){
            let errorObject = responseJson.error;
            if(errorObject.message !== undefined){
              error = `Received error during redemption: "${errorObject.message}"`;
            } else if (errorObject.code !== undefined){
              error = `Received error code ${errorObject.code} during redemption.`;
            }
          }
        } catch(e) {
          // Do nothing.
        }
      }
      application.displayError(error);
    });
  });

  autoShiftCode.addEventListener("click", function(){
    if(autoShiftCode.classList.contains("active") || autoVipCode.classList.contains("active")){
      application.displayError("Auto retrieval still in progress, please wait.");
      return;
    }
    autoShiftCode.classList.add("active");
    application.displayNotification("Starting Auto-SHiFT retrieval...");
    application.executeAutoShift().then(function(shiftResponses){
      autoShiftCode.classList.remove("active");
      let successCount = shiftResponses.filter((shiftResponse) => shiftResponse.success).length;
      application.displayNotification(`Found ${shiftResponses.length} codes, ${successCount} of which were redeemed.`);
    }).catch(function(error){
      autoShiftCode.classList.remove("active");
      if(error instanceof XMLHttpRequest){
        try {
          let responseJson = JSON.parse(error.responseText);
          if(responseJson.error !== undefined){
            let errorObject = responseJson.error;
            if(errorObject.message !== undefined){
              error = `Received error during redemption: "${errorObject.message}"`;
            } else if (errorObject.code !== undefined){
              error = `Received error code ${errorObject.code} during redemption.`;
            }
          }
        } catch(e) {
          // Do nothing.
        }
      }
      application.displayError(error);
    });
  });

  autoVipCode.addEventListener("click", function(){
    if(autoShiftCode.classList.contains("active") || autoVipCode.classList.contains("active")){
      application.displayError("Auto retrieval still in progress, please wait.");
      return;
    }
    autoVipCode.classList.add("active");
    application.displayNotification("Starting Auto-VIP retrieval...");
    application.executeAutoVip().then(function(vipResponses){
      autoVipCode.classList.remove("active");
      let successCount = vipResponses.filter((vipResponse) => vipResponse.success).length;
      application.displayNotification(`Found ${vipResponses.length} codes, ${successCount} of which were redeemed.`);
    }).catch(function(error){
      autoVipCode.classList.remove("active");
      application.displayError(error);
    });
  });

  application.getVipConfiguration().then(function(vipConfiguration){
    for(let configuration of vipConfiguration){
      let containerNode = document.createElement("div"),
          labelNode = document.createElement("label"),
          inputNode = document.createElement("input"),
          buttonNode = document.createElement("input"),
          idBase = `vip_${configuration.codeType}`,
          redeemId = `redeem_${idBase}`,
          typeTitle = configuration.codeType.split(" ").map((titlePart) => titlePart.substring(0, 1).toUpperCase() + titlePart.substring(1)).join(" ");

      containerNode.classList.add("input");
      
      labelNode.innerText = `${typeTitle} VIP Code`;
      labelNode.setAttribute("for", idBase);

      inputNode.setAttribute("id", idBase);
      inputNode.setAttribute("type", "text");

      buttonNode.setAttribute("id", redeemId);
      buttonNode.setAttribute("value", "Redeem");
      buttonNode.setAttribute("type", "button");

      buttonNode.addEventListener("click", function(e){
        application.displayNotification(`Redeeming ${typeTitle} VIP Code...`);
        application.redeemCode("vip", inputNode.value, null, vipConfiguration.campaignId, null).then(function(){
          inputNode.value = "";
          application.displayNotification(`${typeTitle} VIP Code redeemed!`);
          getUserData.then(displayUserData).catch(application.displayError);
        }).catch((error) => application.displayError(error));
      });

      for(let childNode of [labelNode, inputNode, buttonNode]){
        containerNode.appendChild(childNode);
      }
      codeInputNode.appendChild(containerNode);
    }
  });

})(Application);
