(()=>{"use strict";var e,t={8636(e,t,o){var n=o(7130),i=o(1927),r=o(392),a=o(8085);Object.defineProperty(p,"name",{value:"default",configurable:!0});const c=Object.fromEntries(Object.entries({browsecHasBeenInstalled:"browsec_has_been_installed",clickAndThen1:"click_and_then_1",clickAndThen2:"click_and_then_2",pinTheBrowsecExtension:"pin_the_browsec_extension",youMayNowOpenTheExtension:"you_may_now_open_the_extension",subscriberText:"subscriber_text"}).map((([e,t])=>[e,(0,n.A)(t)])));let s;const u=(0,a.BZ)().i18n.getUILanguage();function l(){r.A.track("congrats_tab_tgclick")}function p(){return i.qy`
  <style>
  :host{
    display: block;
  }
  :host > .In{
    padding: 27px 0 0;
    position: relative;
  }

  .Plate{
    background: #262829;
    width: 610px;
    padding: 25px 35px 15px;
    margin: 0 auto;
  }

  .BrowsecInstalled{
    text-align: center;
    font-size: 24px;
    font-weight: bold;
  }
  .BrowsecInstalled::before{
    content: '';
    display:block;
    width:85px;
    padding-top: 86px;
    height:0;
    background: url( '/images/checked_2.svg' );
    margin: 0 auto 20px;
  }

  .Decription{
    padding: 20px 0 30px;
    text-align: center;
  }

  .Image{
    margin: 0 -16px;
    padding: 10px 0 40px;
  }

  .Pointer{
    position: absolute;
    top: 0;
    right: 132px;
    width: 190px;
    font-size: 18px;
  }
  .Pointer.withScroll{
    right: 115px;
  }
  .Pointer::before{
    content: '';
    display: block;
    background: rgba(28, 30, 31, 0.6);
    position: absolute;
    top: 0;
    right: -25px;
    left: -25px;
    bottom: -10px;
  }
  .Pointer > .In{
    position: relative;
    padding: 110px 0 0;
  }
  .Pointer_Arrow{
    position: absolute;
    height: 65px;
    top: 30px;
    right: 0;
    left: 0;
    border: 1px solid #fff;
    border-width: 0 1px 1px 0;
    border-radius: 0 0 8px 0;
  }
  .Pointer_Arrow::before,
  .Pointer_Arrow::after{
    content: '';
    display: block;
    height: 17px;
    width: 1px;
    background: #fff;
    position: absolute;
    top:0;
    right:-1px;
  }
  .Pointer_Arrow::before{
    transform-origin: top left;
    transform: rotate(-45deg);
  }
  .Pointer_Arrow::after{
    transform-origin: top right;
    transform: rotate(45deg);
  }
  .Pointer_Title{
    text-align: center;
  }
  .Pointer_Text{
    text-align: center;
    padding: 17px 0 0;
    margin: 0 -20px;
  }

  .Pointer_Icon{
    display: inline-block;
    vertical-align: bottom;
    margin: 0 2px;
  }
  .Pointer_Icon.extensions{
    background: url( '/images/congratulations/extensions_icon_3.svg' );
    background-size: contain;
    background-repeat: no-repeat;
    width: 31px;
    height: 30px;
  }
  .Pointer_Icon.pin{
    background: url( '/images/congratulations/pin.svg' );
    background-size: contain;
    background-repeat: no-repeat;
    width: 22px;
    height: 29px;
  }

  .Subscriber {
    border-radius: 8px;
    overflow: hidden;
    display: block;
    text-decoration: none;
  }

  .Subscriber > .In {
    padding: 10px;
    background: #F8F8F8;
    color: #222;
    display: flex;
    flex-direction: row;
    align-items: center;
    text-align: center;
    font-size: 14px;
    transition: background 0.3s;
    gap: 20px;
  }

  .Subscriber:hover > .In {
    background:rgb(217, 217, 217);
  }

  .Subscriber .Subscriber_Text {
    order: 2;
  }

  .Subscriber .Subscriber_Img {
    background: url('/images/congratulations/telegram-logo.svg');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    width: 36px;
    height: 36px;
  }

  @media (min-width: 1410px) {
    .Subscriber {
      position: absolute;
      top: 300px;
      right: 60px;
      width: 290px;
    }

    .Subscriber > .In {
      flex-direction: column;
      gap: 0;
    }

    .Subscriber .Subscriber_Text {
      order: 0;
      margin-bottom: 10px;
    }
  }
  </style>

  <div class="In">
    <div class="Plate">
      <div class="BrowsecInstalled">${c.browsecHasBeenInstalled}</div>
      <div class="Decription">${c.youMayNowOpenTheExtension}</div>

      <a class="Subscriber" href="${s}" target="_blank" rel="noopener" @click="${l}">
        <div class="In">
          <div class="Subscriber_Text">${c.subscriberText}</div>
          <div class="Subscriber_Img"></div>
        </div>
      </a>

      <div class="Image">
        <use-animation></use-animation>
      </div>
    </div>

    <div class="Pointer ${this.withScroll?"withScroll":""}">
      <div class="In">
        <div class="Pointer_Arrow"></div>
        <div class="Pointer_Title">${c.pinTheBrowsecExtension}</div>
        <div class="Pointer_Text">
          ${c.clickAndThen1}
          <div class="Pointer_Icon extensions"></div>
          ${c.clickAndThen2}
          <div class="Pointer_Icon pin"></div>
        </div>
      </div>
    </div>
  </div>`}s="ru"===u?"https://t.me/BrowsecVPNru":"https://t.me/BrowsecVPNofficial";var d=o(8987),g=o(4712);const m=class{constructor(e){if(!e)throw new Error("AnimationElement argument is not Element");this.element=e}set value(e){e!==this._oldValue&&(this._oldValue=e,this.element.style.cssText=e)}};(Object.getOwnPropertyDescriptor(m,"name")||{}).writable||Object.defineProperty(m,"name",{value:"default",configurable:!0});const _=[1e3,400,1250,200,300,1250,200,400,1250,200,400,750,200,400,1250,200,400,1250],v=_.reduce(((e,t)=>e+t),0),b=_.map((e=>e/v)),w=b.map(((e,t)=>b.slice(0,t+1).reduce(((e,t)=>e+t),0))),h=e=>{let t=new m(e.querySelector("div.Animation_Search")),o=new m(e.querySelector("div.Animation_Cursor")),n=new m(e.querySelector("div.Animation_ExtensionsIcon")),i=new m(e.querySelector("div.Animation_BrowsecIcon")),r=new m(e.querySelector("div.Animation_BrowsecIconUk")),a=new m(e.querySelector("div.Animation_BrowsecIconUs")),c=new m(e.querySelector("div.Animation_ExtensionsPopup")),s=new m(e.querySelector("div.Animation_PinEnabled")),u=new m(e.querySelector("div.Animation_PinEnabledHover")),l=new m(e.querySelector("div.Animation_BrowsecPopup")),p=new m(e.querySelector("div.Animation_SwitchOn")),d=new m(e.querySelector("div.Animation_SwitchOff")),g=new m(e.querySelector("div.Animation_BrowsecPopup_NoProtection")),_=new m(e.querySelector("div.Animation_BrowsecPopup_Protection")),h=new m(e.querySelector("div.Animation_BrowsecPopup_Protection_Hover")),f=new m(e.querySelector("div.Animation_BrowsecPopup_ProtectionUs")),y=new m(e.querySelector("div.Animation_BrowsecPopup_SmartSettings")),A=new m(e.querySelector("div.Animation_BrowsecPopup_SmartSettingsHover"));return{start:()=>new Promise((e=>{let m,P=k=>{void 0===m&&(m=k);let x=k-m;if(x>v)return void e();const S=(()=>{let e=Math.floor(x/v);return x-e*v})()/v;{let e=(()=>{switch(!0){case S<=w[1]:return 532;case S<=w[2]:return 487+45*(1-(S-w[1])/b[2]);case S<=w[4]:return 487;case S<=w[5]:return 487+13*((S-w[4])/b[5]);case S<=w[7]:return 500;case S<=w[8]:return 500+-180*((S-w[7])/b[8]);case S<=w[10]:return 320;case S<=w[11]:return 320+124*((S-w[10])/b[11]);case S<=w[13]:return 444;case S<=w[14]:return 444+-120*((S-w[13])/b[14]);default:return 324}})(),t=(()=>{switch(!0){case S<=b[0]:return 19+164*(1-S/b[0]);case S<=w[1]:return 19;case S<=w[2]:return 19+144*((S-w[1])/b[2]);case S<=w[4]:return 163;case S<=w[5]:return 19+144*(1-(S-w[4])/b[5]);case S<=w[7]:return 19;case S<=w[8]:return 19+336*((S-w[7])/b[8]);case S<=w[10]:return 355;case S<=w[11]:return 355+-11*((S-w[10])/b[11]);case S<=w[13]:return 344;case S<=w[14]:return 344+-47*((S-w[13])/b[14]);default:return 297}})();o.value=`left:${e}px;top:${t}px;`}n.value=S<=b[0]?"opacity:0;":S<=w[6]?"opacity:1;":"opacity:0;";{let e=S<=b[0]?0:S<=w[1]?(S-b[0])/b[1]:S<=w[6]?1:0;c.value=`opacity:${e};`}u.value=S<=w[3]?"opacity:0":S<=w[4]?"opacity:1":"opacity:0",s.value=S<=w[4]?"opacity:0":S<=w[6]?"opacity:1":"opacity:0",t.value=S<=w[3]?"opacity:0":"opacity:1",i.value=S<=w[6]?"opacity:0;":S<=w[9]?"opacity:1;":"opacity:0;",r.value=S<=w[9]?"opacity:0;":S<=w[15]?"opacity:1;":"opacity:0;",a.value=S<=w[15]?"opacity:0":(w[16],"opacity:1"),l.value=(()=>{if(S<=w[6])return"";if(S<=w[7]){return`opacity:${(S-w[6])/b[7]};`}return"opacity:1;"})();{let e=S<=w[6]?0:S<=w[9]?1:S<=w[10]?1-(S-w[9])/b[10]:0;d.value=`opacity:${e};`}{let e=S<=w[9]?0:S<=w[10]?(S-w[9])/b[10]:1;p.value=`opacity:${e};`}g.value=(()=>{if(S<=w[6])return"";if(S<=w[9])return"opacity:1;";if(S<=w[10]){return`opacity:${1-(S-w[9])/b[10]};`}return""})(),_.value=(()=>{if(S<=w[9])return"";if(S<=w[10]){return`opacity:${(S-w[9])/b[10]};`}if(S<=w[11]){return(S-w[10])/b[11]<.7?"opacity:1;":""}return""})(),h.value=(()=>{if(S<=w[10])return"";if(S<=w[11]){return(S-w[10])/b[11]<.7?"":"opacity:1;"}if(S<=w[13]){return`opacity:${1-(S-w[12])/b[13]};`}return""})(),y.value=(()=>{if(S<=w[12])return"";if(S<=w[13]){return`opacity:${(S-w[12])/b[13]};`}if(S<=w[14]){return(S-w[13])/b[14]>.7?"":"opacity:1"}return""})(),A.value=(()=>{if(S<=w[13])return"";if(S<=w[14]){return(S-w[13])/b[14]>.7?"opacity:1":""}if(S<=w[15])return"opacity:1;";if(S<=w[16]){return`opacity:${1-(S-w[15])/b[16]};`}return""})(),f.value=(()=>{if(S<=w[15])return"";if(S<=w[16]){return`opacity:${(S-w[15])/b[16]};`}return"opacity:1;"})(),self.requestAnimationFrame(P)};self.requestAnimationFrame(P)}))}};(Object.getOwnPropertyDescriptor(h,"name")||{}).writable||Object.defineProperty(h,"name",{value:"default",configurable:!0});const f=[1250,200,400,1250,200,400,750,200,400,1250,200,400,1250],y=f.reduce(((e,t)=>e+t),0),A=f.map((e=>e/y)),P=A.map(((e,t)=>A.slice(0,t+1).reduce(((e,t)=>e+t),0))),k=e=>{let t=new m(e.querySelector("div.Animation_Cursor")),o=new m(e.querySelector("div.Animation_BrowsecIcon")),n=new m(e.querySelector("div.Animation_BrowsecIconUk")),i=new m(e.querySelector("div.Animation_BrowsecIconUs")),r=new m(e.querySelector("div.Animation_BrowsecPopup")),a=new m(e.querySelector("div.Animation_SwitchOn")),c=new m(e.querySelector("div.Animation_SwitchOff")),s=new m(e.querySelector("div.Animation_BrowsecPopup_NoProtection")),u=new m(e.querySelector("div.Animation_BrowsecPopup_Protection")),l=new m(e.querySelector("div.Animation_BrowsecPopup_Protection_Hover")),p=new m(e.querySelector("div.Animation_BrowsecPopup_ProtectionUs")),d=new m(e.querySelector("div.Animation_BrowsecPopup_SmartSettings")),g=new m(e.querySelector("div.Animation_BrowsecPopup_SmartSettingsHover"));return{start:()=>new Promise((e=>{let m,_=v=>{void 0===m&&(m=v);let b=v-m;if(b>y)return void e();const w=(()=>{let e=Math.floor(b/y);return b-e*y})()/y;{let e=(()=>{switch(!0){case w<=A[0]:case w<=P[2]:return 564;case w<=P[3]:return 564+-194*((w-P[2])/A[3]);case w<=P[5]:return 370;case w<=P[6]:return 370+138*((w-P[5])/A[6]);case w<=P[8]:return 508;case w<=P[9]:return 508+-120*((w-P[8])/A[9]);default:return 388}})(),o=(()=>{switch(!0){case w<=A[0]:return 19+144*(1-w/A[0]);case w<=P[2]:return 19;case w<=P[3]:return 19+336*((w-P[2])/A[3]);case w<=P[5]:return 355;case w<=P[6]:return 355+-11*((w-P[5])/A[6]);case w<=P[8]:return 344;case w<=P[9]:return 344+-47*((w-P[8])/A[9]);default:return 297}})();t.value=`left:${e}px;top:${o}px;`}r.value=(()=>{if(w<=P[1])return"";if(w<=P[2]){return`opacity:${(w-P[1])/A[2]};`}return"opacity:1;"})(),o.value=w<=P[1]?"opacity:0;":w<=P[4]?"opacity:1;":"opacity:0;",n.value=w<=P[4]?"opacity:0;":w<=P[10]?"opacity:1;":"opacity:0;",i.value=w<=P[10]?"opacity:0":(P[11],"opacity:1");{let e=w<=P[1]?0:w<=P[4]?1:w<=P[5]?1-(w-P[4])/A[5]:0;c.value=`opacity:${e};`}{let e=w<=P[4]?0:w<=P[5]?(w-P[4])/A[5]:1;a.value=`opacity:${e};`}s.value=(()=>{if(w<=P[1])return"";if(w<=P[4])return"opacity:1;";if(w<=P[5]){return`opacity:${1-(w-P[4])/A[5]};`}return""})(),u.value=(()=>{if(w<=P[4])return"";if(w<=P[5]){return`opacity:${(w-P[4])/A[5]};`}if(w<=P[6]){return(w-P[5])/A[6]<.7?"opacity:1;":""}return""})(),l.value=(()=>{if(w<=P[5])return"";if(w<=P[6]){return(w-P[5])/A[6]<.7?"":"opacity:1;"}if(w<=P[8]){return`opacity:${1-(w-P[7])/A[8]};`}return""})(),d.value=(()=>{if(w<=P[7])return"";if(w<=P[8]){return`opacity:${(w-P[7])/A[8]};`}if(w<=P[9]){return(w-P[8])/A[9]>.7?"":"opacity:1"}return""})(),g.value=(()=>{if(w<=P[8])return"";if(w<=P[9]){return(w-P[8])/A[9]>.7?"opacity:1":""}if(w<=P[10])return"opacity:1;";if(w<=P[11]){return`opacity:${1-(w-P[10])/A[11]};`}return""})(),p.value=(()=>{if(w<=P[10])return"";if(w<=P[11]){return`opacity:${(w-P[10])/A[11]};`}return"opacity:1;"})(),self.requestAnimationFrame(_)};self.requestAnimationFrame(_)}))}};(Object.getOwnPropertyDescriptor(k,"name")||{}).writable||Object.defineProperty(k,"name",{value:"default",configurable:!0});const{userAgent:x}=navigator,S=(0,a.F2)()&&x.includes("Chrome")&&["Edg","Edge"].every((e=>!x.includes(e)));let B;if(S)try{B=Number(x.match(/Chrome\/\d+/)[0].split("/")[1])}catch(e){}const I=Boolean(S&&B&&B>=84);function O(){const e=window.language;return i.qy`
  <style>
  .Animation{
    width: 642px;
    height: 542px;
    position: relative;
    margin: 0 auto;
    overflow: hidden;
    transition: filter 0.4s;
  }
  
  .Animation_Bg{
    background: url( '/images/congratulations/${I?"chrome":"others"}/background.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: 100%;
    height: 100%;
  }
  .Animation_Search{
    opacity: 0;
    background: url( '/images/congratulations/panel_with_browsec.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 610 / 642 );
    height: calc( 100% * 35 / 542 );
    position: absolute;
    left: calc( 100% * 16 / 642 );
    top: calc( 100% * 8 / 542 );
    border-radius: 0 8px 0 0;
  }
  .Animation_Cursor{
    background: url( '/images/congratulations/cursor.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 55 / 642 );
    height: calc( 100% * 59 / 542 );
    position: absolute;
    top: -5000px;
    left: -5000px;
  }
  .Animation_ExtensionsIcon{
    background: url( '/images/congratulations/extensions_icon.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 27 / 642 );
    height: calc( 100% * 27 / 542 );
    position: absolute;
    top: calc( 100% * 12 / 542 );
    left: calc( 100% * 525 / 642 );
  }
  .Animation_BrowsecIcon,
  .Animation_BrowsecIconUk,
  .Animation_BrowsecIconUs{
    opacity: 0;
    width: calc( 100% * 27 / 642 );
    height: calc( 100% * 27 / 542 );
    position: absolute;
    top: calc( 100% * 11 / 542 );
    background-position: 50% 50%;
    background-repeat: no-repeat;
    background-size: 100% auto;
  }
  .Animation.chrome .Animation_BrowsecIcon,
  .Animation.chrome .Animation_BrowsecIconUk,
  .Animation.chrome .Animation_BrowsecIconUs{
    left: calc( 100% * 495 / 642 );
  }
  .Animation.others .Animation_BrowsecIcon,
  .Animation.others .Animation_BrowsecIconUk,
  .Animation.others .Animation_BrowsecIconUs{
    left: calc( 100% * 559 / 642 );
  }
  .Animation_BrowsecIcon{
    background-image: url( '/images/congratulations/browsec_icon.svg' );
  }
  .Animation_BrowsecIconUk{
    background-image: url( '/images/congratulations/browsec_icon_uk.svg' );
  }
  .Animation_BrowsecIconUs{
    background-image: url( '/images/congratulations/browsec_icon_us.svg' );
  }
  .Animation_PinEnabled,
  .Animation_PinEnabledHover{
    opacity: 0;
    width: calc( 100% * 40 / 642 );
    height: calc( 100% * 40 / 542 );
    position: absolute;
    left: calc( 100% * 473 / 642 );
    top: calc( 100% * 148 / 542 );
  }
  .Animation_PinEnabled{
    background: url( '/images/congratulations/pin_enabled.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
  }
  .Animation_PinEnabledHover{
    background: url( '/images/congratulations/pin_enabled_hovered.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
  }
  .Animation_ExtensionsPopup{
    opacity: 0;
    background: url( '/images/congratulations/extensions_popup.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 328 / 642 );
    height: calc( 100% * 199 / 542 );
    position: absolute;
    left: calc( 100% * 229 / 642 );
    top: calc( 100% * 36 / 542 );
  }
  .Animation.langRu .Animation_ExtensionsPopup{
    background-image: url( '/images/congratulations/extensions_popup_ru.svg' );
  }

  .Animation_BrowsecPopup{
    opacity: 0;
    background: url( '/images/congratulations/popup_bg.svg#en' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 408 / 642 );
    height: calc( 100% * 424 / 542 );
    position: absolute;
    top: calc( 100% * 37 / 542 );
  }
  .Animation.langRu .Animation_BrowsecPopup{
    background-image: url( '/images/congratulations/popup_bg.svg#ru' );
  }
  .Animation.chrome .Animation_BrowsecPopup{
    left: calc( 100% * 118 / 642 );
  }
  .Animation.others .Animation_BrowsecPopup{
    left: calc( 100% * 182 / 642 );
  }

  .Animation_SwitchOn,
  .Animation_SwitchOff{
    opacity: 0;
    width: calc( 100% * 61 / 408 );
    height: calc( 100% * 26 / 424 );
    position: absolute;
    bottom: calc( 100% * 11 / 424 );
    right: calc( 100% * 14 / 408 );
  }
  .Animation_SwitchOff{
    background: url( '/images/congratulations/switch_off.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
  }
  .Animation.langRu .Animation_SwitchOff{
    background-image: url( '/images/congratulations/switch_off_ru.svg' );
  }
  .Animation_SwitchOn{
    background: url( '/images/congratulations/switch_on.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
  }
  .Animation.langRu .Animation_SwitchOn{
    background-image: url( '/images/congratulations/switch_on_ru.svg' );
  }
  .Animation_BrowsecPopup_NoProtection{
    opacity: 0;
    background: url( '/images/congratulations/popup_disabled.svg' ) 50% 50% no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 336 / 408 );
    height: calc( 100% * 269 / 424 );
    position: absolute;
    left: calc( 100% * 48 / 408 );
    top: calc( 100% * 78 / 424 );
  }
  .Animation.langRu .Animation_BrowsecPopup_NoProtection{
    background-image: url( '/images/congratulations/popup_disabled_ru.svg' );
    width: calc( 100% * 366 / 408 );
    left: calc( 100% * 21 / 408 );
  }
  .Animation_BrowsecPopup_Protection,
  .Animation_BrowsecPopup_Protection_Hover,
  .Animation_BrowsecPopup_ProtectionUs,
  .Animation_BrowsecPopup_ProtectionUs_Hover{
    opacity: 0;
    background-position: 50% 50%;
    background-repeat: no-repeat;
    background-size: 100% auto;
    width: calc( 100% * 361 / 408 );
    height: calc( 100% * 263 / 424 );
    position: absolute;
    left: calc( 100% * 24 / 408 );
    top: calc( 100% * 78 / 424 );
  }
  .Animation_BrowsecPopup_Protection{
    background-image: url( '/images/congratulations/popup_enabled.svg#uk' );
  }
  .Animation.langRu .Animation_BrowsecPopup_Protection{
    background-image: url( '/images/congratulations/popup_enabled_ru.svg#uk' );
  }
  .Animation_BrowsecPopup_Protection_Hover{
    background-image: url( '/images/congratulations/popup_enabled.svg#uk_hover' );
  }
  .Animation.langRu .Animation_BrowsecPopup_Protection_Hover{
    background-image: url( '/images/congratulations/popup_enabled_ru.svg#uk_hover' );
  }
  .Animation_BrowsecPopup_ProtectionUs{
    background-image: url( '/images/congratulations/popup_enabled.svg#us' );
  }
  .Animation.langRu .Animation_BrowsecPopup_ProtectionUs{
    background-image: url( '/images/congratulations/popup_enabled_ru.svg#us' );
  }
  .Animation_BrowsecPopup_ProtectionUs_Hover{
    background-image: url( '/images/congratulations/popup_enabled.svg#us_hover' );
  }
  .Animation.langRu .Animation_BrowsecPopup_ProtectionUs_Hover{
    background-image: url( '/images/congratulations/popup_enabled_ru.svg#us_hover' );
  }
  .Animation_BrowsecPopup_SmartSettings,
  .Animation_BrowsecPopup_SmartSettingsHover{
    opacity: 0;
    width: calc( 100% * 392 / 408 );
    height: calc( 100% * 321 / 424 );
    position: absolute;
    left: calc( 100% * 14 / 408 );
    top: calc( 100% * 58 / 424 );
  }
  .Animation_BrowsecPopup_SmartSettings{
    background: url( '/images/congratulations/popup_smart_settings.svg#base' ) 50% 50% no-repeat;
    background-size: 100% auto;
  }
  .Animation.langRu .Animation_BrowsecPopup_SmartSettings{
    background-image: url( '/images/congratulations/popup_smart_settings_ru.svg#base' );
  }
  .Animation_BrowsecPopup_SmartSettingsHover{
    background: url( '/images/congratulations/popup_smart_settings.svg#hover' ) 50% 50% no-repeat;
    background-size: 100% auto;
  }
  .Animation.langRu .Animation_BrowsecPopup_SmartSettingsHover{
    background-image: url( '/images/congratulations/popup_smart_settings_ru.svg#hover' );
  }
  </style>

  <div class="Animation ${I?"chrome":"others"} ${"ru"===e?"langRu":""}">
    <div class="Animation_Bg"></div>
    <div class="Animation_Search"></div>

    <div class="Animation_ExtensionsIcon"></div>
    <div class="Animation_BrowsecIcon"></div>
    <div class="Animation_BrowsecIconUk"></div>
    <div class="Animation_BrowsecIconUs"></div>

    <div class="Animation_ExtensionsPopup"></div>
    <div class="Animation_PinEnabledHover"></div>
    <div class="Animation_PinEnabled"></div>

    <div class="Animation_BrowsecPopup">
      <div class="Animation_SwitchOff"></div>
      <div class="Animation_SwitchOn"></div>
      <div class="Animation_BrowsecPopup_NoProtection"></div>
      <div class="Animation_BrowsecPopup_Protection"></div>
      <div class="Animation_BrowsecPopup_Protection_Hover"></div>
      <div class="Animation_BrowsecPopup_ProtectionUs"></div>
      <div class="Animation_BrowsecPopup_ProtectionUs_Hover"></div>
      <div class="Animation_BrowsecPopup_SmartSettings"></div>
      <div class="Animation_BrowsecPopup_SmartSettingsHover"></div>
    </div>

    <div class="Animation_Cursor"></div>
  </div>`}Object.defineProperty(O,"name",{value:"default",configurable:!0});class q extends i.WF{render(){return O.call(this)}async firstUpdated(e){super.firstUpdated(e);const t=this.shadowRoot;if(!t)throw new Error("Shadow root not found");const o=t.querySelector("div.Animation");if(!o)throw new Error("Animation element not found");const n=I?h(o):k(o),i=async()=>{await n.start(),i()};i()}}customElements.define("use-animation",q);class E extends((0,g.N)(d.A)(i.WF)){render(){return p.call(this)}static get properties(){return{withScroll:{type:Boolean}}}constructor(){super(),this.withScroll=document.documentElement.scrollHeight>document.documentElement.clientHeight,window.addEventListener("resize",(()=>{const e=document.documentElement.scrollHeight>document.documentElement.clientHeight;e!==this.withScroll&&(this.withScroll=e)}))}}customElements.define("main-block-modern",E);var $=o(1743),U=o(8131);document.title=(0,n.A)("you_just_installed_browsec"),(async()=>{let e=await U.A.get("congrats_number")||0;e++,r.A.track("congrats_tab_open",{congrats_number:e.toString()}),await U.A.set("congrats_number",e)})();const H=new Promise((e=>{window.addEventListener("DOMContentLoaded",(()=>{e()}))}));(async e=>{const t=(0,$.A)();window.language=t,"ru"===t&&document.documentElement.setAttribute("lang","ru"),await H;const o=document.querySelector("div.Main > div.In");null==o||null===(e=o.append)||void 0===e||e.call(o,document.createElement("main-block-modern"))})()}},o={};function n(e){var i=o[e];if(void 0!==i)return i.exports;var r=o[e]={id:e,loaded:!1,exports:{}};return t[e].call(r.exports,r,r.exports,n),r.loaded=!0,r.exports}n.m=t,e=[],n.O=(t,o,i,r)=>{if(!o){var a=1/0;for(l=0;l<e.length;l++){for(var[o,i,r]=e[l],c=!0,s=0;s<o.length;s++)(!1&r||a>=r)&&Object.keys(n.O).every((e=>n.O[e](o[s])))?o.splice(s--,1):(c=!1,r<a&&(a=r));if(c){e.splice(l--,1);var u=i();void 0!==u&&(t=u)}}return t}r=r||0;for(var l=e.length;l>0&&e[l-1][2]>r;l--)e[l]=e[l-1];e[l]=[o,i,r]},n.n=e=>{var t=e&&e.__esModule?()=>e.default:()=>e;return n.d(t,{a:t}),t},n.d=(e,t)=>{for(var o in t)n.o(t,o)&&!n.o(e,o)&&Object.defineProperty(e,o,{enumerable:!0,get:t[o]})},n.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"==typeof window)return window}}(),n.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),n.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.nmd=e=>(e.paths=[],e.children||(e.children=[]),e),n.j=556,(()=>{var e={556:0};n.O.j=t=>0===e[t];var t=(t,o)=>{var i,r,[a,c,s]=o,u=0;if(a.some((t=>0!==e[t]))){for(i in c)n.o(c,i)&&(n.m[i]=c[i]);if(s)var l=s(n)}for(t&&t(o);u<a.length;u++)r=a[u],n.o(e,r)&&e[r]&&e[r][0](),e[r]=0;return n.O(l)},o=self.webpackChunkbrowsec_extension=self.webpackChunkbrowsec_extension||[];o.forEach(t.bind(null,0)),o.push=t.bind(null,o.push.bind(o))})();var i=n.O(void 0,[76],(()=>n(8636)));i=n.O(i)})();