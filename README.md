# Vault Key: Borderlands™ 3 Reward Redeemer

This is a Chrome extension that provides a highlight context menu and automatic redemption capability for 2K® Games and Gearbox® Software's Borderlands™ 3.

*This software is not affiliated with 2K® Games or Gearbox® Software in any way, and no guarantees are made about it's functionality. Borderlands™ is trademarked and owned by 2K® Games and Gearbox® Software.*

A huge thanks is due to [matt1484](https://github.com/matt1484/bl3_auto_vip) for his Go application, on which this was based.

## Features
1. Highlighted codes can be right-clicked to redeem as a SHiFT or VIP Reward.

    a. SHiFT rewards can be redeemed against any registered SHiFT Account, on your desired platform.
    
    b. VIP Rewards are not platform-specific and thus are redeemed against your registered account.
    
2. Automatically fetch SHiFT and VIP codes from trusted sources\* and redeem them.
3. Track used codes, including the rewards associated with them\*\*.
4. Track invalid/expired codes, and inform you if you attempt to use them again.

## Usage
1. Install the extension, then navigate to the options page using the extension icon in your browser bar.
2. Input your SHiFT account information, then click "Update Login Information." If the information is correct, data will fill in regarding your codes and/or platform(s). If the information is incorrect, you will be notified.
3. Now the extension features will be available to you. You can redeem codes by:

    a. Highlighting text on any page, then right-clicking to see the context menu, and choosing which kind of code it is to redeem it.
  
    b. Going to the options menu, then entering the code in the appropriate input box and clicking "Redeem."
    
    c. Clicking "Auto-redeem SHiFT" or "Auto-redeem VIP" from either the options page or the popup menu.

SHiFT accounts are registered either in-game or through the official Borderlands website. Note that you cannot redeem VIP codes until you register with the Borderlands VIP program, which must be done on the official Borderlands website and cannot be done in-game.

## Notes
1. Due to the structure of the VIP code API, requests may respond with a 500 status code when a VIP code can't be redeemed due to invalidity or account constraints. Chrome extensions treat 500 status codes as a server error, and thus will restrict extensions from bombarding the server, thinking it may be overloaded (or the extension is maliciously DDoS'ing.) If this happens, all VIP code requests will fail for some time. Invalid or already-used codes are tracked, so future requests will ignore them. This can be especially obvious when first using the extension and attempting to redeem all VIP codes - as codes are either used or ruled out, future requests will proceed smoothly. For more information on Chrome extension throttling, see http://dev.chromium.org/throttling.
2. Your SHiFT username and password must be stored for this extension to function. These are only accessible within the context of the extension (the background script and options page), and are never sent anywhere except to 2K/Gearbox API's. Login sessions are stored for 24 hours (how long a session is valid on the 2K/GB side is unknown, this is a safe length of time.)
3. As the API utilized are unpublished, they are subject to change with no notice to users of this extension - it will simply stop working. Check the github page to see if we're aware of it - and if not, please let us know! We'll address the issue as soon as we're able.
4. As these codes are made publicly available on numerous social media and web platforms, it is presently not considered cheating, hacking or out-of-scope for the SHiFT/VIP program to use an extension like this, however, this is subject to change at any time. See the privacy policy for the various online services offered at https://www.take2games.com/privacy/, and legal information at https://www.take2games.com/legal/.

*\* Trusted sources are hardcoded in this extension. There is no "official" repository of codes, so we use fan sites to aggregate for us. As new sources appear, they will be included in future updates.*

*\*\*Rewards are reported through the 2K/Gearbox API, so accuracy depends on their descriptions.*
