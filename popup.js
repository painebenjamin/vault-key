(function(application){
  let optionButton = document.querySelector("input#options"),
      autoShiftButton = document.querySelector("input#auto-shift"),
      autoVipButton = document.querySelector("input#auto-vip"),
      ongoingAction = null;

  optionButton.addEventListener("click", function(){
    chrome.runtime.openOptionsPage();
  });

  autoShiftButton.addEventListener("click", function(){
    if(ongoingAction !== null){
      application.displayNotification(`${ongoingAction} is still occurring. Please wait.`);
    } else {
      application.displayNotification("Starting Auto-SHiFT retrieval...");
      ongoingAction = "Auto-SHiFT retrieval";
      application.executeAutoShift().then(function(shiftResponses){
        ongoingAction = null;
        let successCount = shiftResponses.filter((shiftResponse) => shiftResponse.success).length;
        application.displayNotification(`Found ${shiftResponses.length} codes, ${successCount} of which were redeemed.`);
      });
    }
  });

  autoVipButton.addEventListener("click", function(){
    if(ongoingAction !== null){
      application.displayNotification(`${ongoingAction} is still occurring. Please wait.`);
    } else {
      application.displayNotification("Starting Auto-VIP retrieval...");
      ongoingAction = "Auto-VIP retrieval";
      application.executeAutoVip().then(function(vipResponses){
        ongoingAction = null;
        let successCount = vipResponses.filter((vipResponse) => vipResponse.success).length;
        application.displayNotification(`Found ${vipResponses.length} codes, ${successCount} of which were redeemed.`);
      });
    }
  });
})(Application);
