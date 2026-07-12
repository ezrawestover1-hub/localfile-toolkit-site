(() => {
  "use strict";
  const PRODUCTS = Object.freeze({
    ledgerlift:{name:"LedgerLift",icon:window.PRODUCT_ICONS.ledgerlift.icon,description:"Private CSV-to-IIF conversion for recurring QuickBooks Desktop workflows.",home:"../ledgerlift/index.html",benefits:{standard:["Unlimited core conversions","Preview and basic validation","No ads inside the converter"],plus:["Everything in Standard","Saved mapping and account profiles","Advanced debit / credit mapping, categorization, duplicate review, and reports"]}},
    pixelport:{name:"PixelPort",icon:window.PRODUCT_ICONS.pixelport.icon,description:"Private image conversion for PNG, JPG, WebP and supported AVIF files.",home:"../pixelport/index.html",benefits:{standard:["Unlimited core image conversions","Quality and output controls","No ads inside the converter"],plus:["Everything in Standard","Batch image queue and reusable presets","Background, filename, and web optimization controls"]}},
    contactcraft:{name:"ContactCraft",icon:window.PRODUCT_ICONS.contactcraft.icon,description:"Private contact conversion between VCF/vCard and CSV.",home:"../contactcraft/index.html",benefits:{standard:["Unlimited core contact conversions","Preview before export","No ads inside the converter"],plus:["Everything in Standard","Duplicate detection and merge review","Cleanup, output mapping, and validation reports"]}},
    calendarflow:{name:"CalendarFlow",icon:window.PRODUCT_ICONS.calendarflow.icon,description:"Private calendar conversion between ICS/iCalendar and CSV.",home:"../calendarflow/index.html",benefits:{standard:["Unlimited core calendar conversions","Preview before export","No ads inside the converter"],plus:["Everything in Standard","Calendar merging, filtering, and duplicate removal","Saved presets, recurrence normalization, and validation reports"]}},
    captionshift:{name:"CaptionShift",icon:window.PRODUCT_ICONS.captionshift.icon,description:"Private subtitle conversion among SRT, VTT, SBV and ASS.",home:"../captionshift/index.html",benefits:{standard:["Unlimited core subtitle conversions","Timing preview and export","No ads inside the converter"],plus:["Everything in Standard","Batch conversion and saved timing presets","Find-and-replace cleanup and timing validation reports"]}},
    suite:{name:"Complete Plus Bundle",icons:Object.values(window.PRODUCT_ICONS).map(item=>item.icon),description:"One-time Plus entitlement for all five private converter products.",home:"../index.html",benefits:{bundle:["LedgerLift Plus with saved profiles, advanced mapping, categorization, duplicate review, and reports","PixelPort Plus","ContactCraft Plus","CalendarFlow Plus","CaptionShift Plus","Save $26.96 versus five separate Plus licenses"]}}
  });
  const pricing=window.LOCALFILE_PRICING;
  const PLANS=Object.freeze({standard:{label:"Standard"},plus:{label:"Plus"},bundle:{label:"Complete Plus Bundle"}});
  Object.values(PRODUCTS).forEach(item=>{if(item.benefits.plus && !["LedgerLift","PixelPort","ContactCraft","CalendarFlow","CaptionShift"].includes(item.name))item.benefits.plus=["Everything in Standard","Plus-specific controls — planned","Not included in the current release"];});
  const params=new URLSearchParams(location.search);
  const productKey=params.get("product")||"suite";
  const planKey=params.get("plan")||"bundle";
  const product=PRODUCTS[productKey];
  const plan=PLANS[planKey];
  const valid=product && plan && ((productKey==="suite"&&planKey==="bundle")||(productKey!=="suite"&&(planKey==="standard"||planKey==="plus")));
  const $=id=>document.getElementById(id);
  const button=$("checkoutButton"), msg=$("setupMessage");
  if(!valid){location.replace("../pricing.html");return;}
  $("returnLink").href=product.home;
  const emblemSources = product.icons || (product.icon ? [product.icon] : []);
  emblemSources.forEach(src=>{
    const image=document.createElement("img");
    image.src=src;
    image.alt="";
    image.width=48;
    image.height=48;
    image.setAttribute("aria-hidden","true");
    $("productEmblems").appendChild(image);
  });
  $("productKind").textContent=product.name;
  $("purchaseTitle").textContent=productKey==="suite"?"You are purchasing: Five-product Plus bundle":"You are purchasing: "+product.name+" "+plan.label;
  $("purchaseDescription").textContent=product.description;
  const priceCents=productKey==="suite"?pricing.bundle.plus:pricing[productKey][planKey];
  $("purchasePrice").textContent=window.formatLocalFilePrice(priceCents);
  (product.benefits[planKey]||[]).forEach(text=>{const li=document.createElement("li");li.textContent=text;$("benefitList").appendChild(li);});
  const cfg=window.LOCALFILE_PADDLE||{};
  const token=typeof cfg.clientToken==="string"?cfg.clientToken.trim():"";
  const priceId=cfg.prices?.[productKey]?.[planKey]||"";
  const ready=cfg.checkoutEnabled===true&&cfg.environment==="sandbox"&&/^test_/.test(token)&&/^pri_/.test(priceId)&&window.Paddle;
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
        settings:{displayMode:"overlay",variant:"one-page",theme:"light",locale:"en",successUrl:success.href}
      });
    });
  }catch(error){
    msg.textContent="Secure checkout could not initialize. Confirm the Paddle environment, token, approved domain, and price IDs.";
    button.disabled=true;
  }
})();
