(() => {
  "use strict";
  const PRODUCTS = Object.freeze({
    ledgerlift:{name:"LedgerLift",description:"Private CSV-to-IIF conversion for recurring QuickBooks Desktop workflows.",home:"../ledgerlift/index.html",benefits:{standard:["Unlimited core conversions","Preview and basic validation","No ads inside the converter"],plus:["Everything in Standard","Reusable bank and account profiles","Saved mappings and advanced workflow tools"]}},
    pixelport:{name:"PixelPort",description:"Private image conversion for PNG, JPG, WebP and supported AVIF files.",home:"../pixelport/index.html",benefits:{standard:["Unlimited core image conversions","Quality and output controls","No ads inside the converter"],plus:["Everything in Standard","Reusable conversion presets","Batch-oriented Plus workflow tools"]}},
    contactcraft:{name:"ContactCraft",description:"Private contact conversion between VCF/vCard and CSV.",home:"../contactcraft/index.html",benefits:{standard:["Unlimited core contact conversions","Preview before export","No ads inside the converter"],plus:["Everything in Standard","Reusable field mappings","Deduplication and advanced organization tools"]}},
    calendarflow:{name:"CalendarFlow",description:"Private calendar conversion between ICS/iCalendar and CSV.",home:"../calendarflow/index.html",benefits:{standard:["Unlimited core calendar conversions","Preview before export","No ads inside the converter"],plus:["Everything in Standard","Reusable timezone and field presets","Advanced calendar workflow tools"]}},
    captionshift:{name:"CaptionShift",description:"Private subtitle conversion among SRT, VTT, SBV and ASS.",home:"../captionshift/index.html",benefits:{standard:["Unlimited core subtitle conversions","Timing preview and export","No ads inside the converter"],plus:["Everything in Standard","Reusable timing presets","Advanced cleanup and batch workflow tools"]}},
    suite:{name:"Five-product Plus bundle",description:"Lifetime Plus access to all five private converter products.",home:"../index.html",benefits:{bundle:["LedgerLift Plus","PixelPort Plus","ContactCraft Plus","CalendarFlow Plus and CaptionShift Plus","Save $19.96 versus five separate Plus licenses"]}}
  });
  const PLANS=Object.freeze({standard:{label:"Standard",price:"$9.99"},plus:{label:"Plus",price:"$11.99"},bundle:{label:"Complete bundle",price:"$39.99"}});
  const params=new URLSearchParams(location.search);
  const productKey=params.get("product")||"suite";
  const planKey=params.get("plan")||"bundle";
  const product=PRODUCTS[productKey];
  const plan=PLANS[planKey];
  const valid=product && plan && ((productKey==="suite"&&planKey==="bundle")||(productKey!=="suite"&&(planKey==="standard"||planKey==="plus")));
  const $=id=>document.getElementById(id);
  const button=$("checkoutButton"), msg=$("setupMessage");
  if(!valid){location.replace("../index.html");return;}
  $("returnLink").href=product.home;
  $("productKind").textContent=product.name;
  $("purchaseTitle").textContent=productKey==="suite"?product.name:`${product.name} ${plan.label}`;
  $("purchaseDescription").textContent=product.description;
  $("purchasePrice").textContent=plan.price;
  (product.benefits[planKey]||[]).forEach(text=>{const li=document.createElement("li");li.textContent=text;$("benefitList").appendChild(li);});
  const cfg=window.LOCALFILE_PADDLE||{};
  const token=typeof cfg.clientToken==="string"?cfg.clientToken.trim():"";
  const priceId=cfg.prices?.[productKey]?.[planKey]||"";
  const ready=/^(test|live)_/.test(token)&&/^pri_/.test(priceId)&&window.Paddle;
  if(!ready){
    msg.textContent="Checkout is in setup mode. Add your Paddle client-side token and price IDs in paddle-config.js.";
    button.disabled=true;
    return;
  }
  try{
    if(cfg.environment==="sandbox") window.Paddle.Environment.set("sandbox");
    window.Paddle.Initialize({token});
    button.disabled=false;
    msg.textContent="Payment details are handled by Paddle Checkout.";
    button.addEventListener("click",()=>{
      const success=new URL("purchase-success.html",location.href);
      success.searchParams.set("product",productKey);
      success.searchParams.set("plan",planKey);
      window.Paddle.Checkout.open({
        items:[{priceId,quantity:1}],
        settings:{displayMode:"overlay",theme:"light",locale:"en",successUrl:success.href}
      });
    });
  }catch(error){
    msg.textContent="Secure checkout could not initialize. Confirm the Paddle environment, token, approved domain, and price IDs.";
    button.disabled=true;
  }
})();
