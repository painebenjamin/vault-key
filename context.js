(function(application){
  "use strict";
  let redeemCode = function(codeType, platform, campaignId){
    return function(info){
      application.redeemCode(codeType, info.selectionText, platform, campaignId).then(function(){
        let message = `${codeType.toUpperCase()} code ${info.selectionText} redeemed`;
        if(platform === null){
          message = `${message}!`;
        } else {
          message = `${message} for ${platform}!`;
        }
        application.displayNotification(message);
      }).catch((errorMessage) => application.displayError(`Could not redeem code: ${errorMessage}`));
    };
  };

  let buildContextMenu = function(){
    chrome.contextMenus.removeAll();

    let parentContextItem = chrome.contextMenus.create({"title": "Vault Key", "contexts": ["selection"]}),
        redeemShiftCode = chrome.contextMenus.create({"title": "Redeem SHiFT Code", "parentId": parentContextItem, "contexts": [ "selection" ]});

    application.getPlatforms().then(function(platforms){
      application.getVipConfiguration().then(function(vipConfiguration){
        chrome.contextMenus.update(redeemShiftCode, {"onclick": null});
        
        for(let configuration of vipConfiguration){
          let prettyName = configuration.codeType.split(" ").map((namePart) => namePart.substring(0, 1).toUpperCase() + namePart.substring(1).toLowerCase()).join(" ");
          chrome.contextMenus.create({"title": `Redeem ${prettyName} VIP Code`, "contexts": ["selection"], "parentId": parentContextItem, "onclick": redeemCode("vip", null, configuration.campaignId)});
        }

        for(let platform of platforms){
          let redeemShiftForPlatform = chrome.contextMenus.create({"title": `Redeem for '${platform.service}'`, "contexts": ["selection"], "parentId": redeemShiftCode, "onclick": redeemCode("shift", platform.service)});

        }

      }).catch(function(errorMessage){
        chrome.contextMenus.update(redeemShiftCode, {"onclick": application.displayStartupError(errorMessage)});
      });
    }).catch(function(errorMessage){
      chrome.contextMenus.update(redeemShiftCode, {"onclick": application.displayStartupError(errorMessage)});
    });
  };

  chrome.runtime.onInstalled.addListener(buildContextMenu);
  chrome.runtime.onMessage.addListener(function(message, callback){
    if(message.data === "loginUpdated"){
      buildContextMenu();
    }
  });

  buildContextMenu();
})(Application);
