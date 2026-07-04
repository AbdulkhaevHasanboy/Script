(()=>{"use strict";var e,i={8775(e,i,t){var a=t(7130),r=t(1743),d=t(1927),c=t(392);Object.defineProperty(p,"name",{value:"default",configurable:!0});const s=Object.fromEntries(Object.entries({title:"installed_compare_title",subtitle:"installed_compare_subtitle",description:"installed_compare_description",free:"installed_compare_free",freePrice:"installed_compare_free_price",premium:"installed_compare_premium",premiumPrice:"installed_compare_premium_price",encryption:"installed_compare_encryption",noAds:"installed_compare_no_ads",speed:"installed_compare_speed",servers:"installed_compare_servers",desktopApp:"installed_compare_desktop_app",continueFree:"installed_compare_continue_free",getPremium:"installed_compare_get_premium",ruFreeIssue:"installed_compare_ru_free_issue",ruPremiumStable:"installed_compare_ru_premium_stable"}).map((([e,i])=>[e,(0,a.A)(i)]))),n="ru"===(0,r.A)();function o(){c.A.track("congrats_tab_free",{campaign:"default"}),window.location.href="/pages/congratulations/congratulations.html"}function l(e){e.currentTarget.getAttribute("href")?c.A.track("congrats_tab_click",{campaign:"default"}):e.preventDefault()}function p(){return d.qy`
  <style>
  :host{
    display: block;
  }
  :host > .In{
    padding: 60px 0 0;
    position: relative;
  }

  .Header{
    text-align: center;
    max-width: 700px;
    margin: 0 auto 40px;
  }

  .Title{
    font-size: 24px;
    font-weight: bold;
  }
  .Title::before{
    content: '';
    display: block;
    width: 85px;
    padding-top: 86px;
    height: 0;
    background: url( '/images/checked_2.svg' );
    margin: 0 auto 20px;
  }

  .Subtitle{
    font-size: 20px;
    font-weight: 600;
    padding: 16px 0 8px;
  }

  .Description{
    font-size: 16px;
    color: rgba(255, 255, 255, 0.7);
    padding: 0 20px;
  }

  .compare-cards{
    font-size: 16px;
  }

  .compare-cards,
  .compare-cards *{
    box-sizing: border-box;
  }

  .cards{
    display: flex;
    gap: 40px;
    justify-content: center;
    align-items: stretch;
    flex-wrap: wrap;
    padding: 0 20px;
  }

  .card{
    background: linear-gradient(180deg, rgba(198, 198, 198, 0.22) 0%, rgba(255, 255, 255, 0.22) 100%);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    color: #ffffff;
    padding: 30px;
    min-width: 420px;
    max-width: 460px;
    position: relative;
  }

  .card-header{
    font-weight: bold;
    font-size: 18px;
    margin-bottom: 32px;
  }

  .card-title{
    font-size: 34px;
    margin-bottom: 4px;
    color: #fff;
    font-weight: 600;
  }

  .card-subtitle{
    font-size: 16px;
    color: #FFF;
    font-weight: 500;
  }

  .card-items{
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-item{
    display: flex;
    gap: 8px;
    font-size: 20px;
  }

  .card-item-icon{
    font-size: 16px;
    margin-top: 2px;
  }

  .card-actions{
    margin-top: auto;
    padding-top: 40px;
    width: 100%;
  }

  a.card-button{
    width: 100%;
    text-align: center;
    padding: 12px;
    background: #fff;
    color: rgb(16, 98, 144);
    border-radius: 6px;
    display: block;
    text-decoration: none !important;
    font-size: 18px;
    transition: box-shadow 0.3s ease, background 0.3s ease;
    font-weight: 600;
    text-transform: uppercase;
    cursor: pointer;
  }

  a.card-button:hover{
    background: #e3e3e3;
  }

  a.card-button.free-button{
    background: none;
    border: 2px solid #fff;
    color: #fff;
  }

  a.card-button.free-button:hover{
    background: rgba(255, 255, 255, 0.1);
  }

  a.card-button.premium-button{
    background: rgba(192, 84, 66, 1);
    color: #fff;
  }

  a.card-button.premium-button:hover{
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
    background: rgb(209, 89, 68);
  }

  @media (max-width: 940px) {
    .card{
      min-width: 320px;
    }
  }
  </style>

  <div class="In">
    <div class="Header">
      <div class="Title">${s.title}</div>
      <div class="Subtitle">${s.subtitle}</div>
      <div class="Description">${s.description}</div>
    </div>

    <div class="compare-cards">
      <div class="cards">
        <div class="card">
          <div class="card-header">
            <div class="card-title">${s.free}</div>
            <div class="card-subtitle">${s.freePrice}</div>
          </div>

          <div class="card-items">
            ${n?d.qy`
              <div class="card-item">
                <div class="card-item-icon">\u26A0\uFE0F</div>
                <div class="card-item-text">${s.ruFreeIssue}</div>
              </div>`:""}
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.encryption}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.noAds}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u274C</div>
              <div class="card-item-text">${s.speed}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u274C</div>
              <div class="card-item-text">${s.servers}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u274C</div>
              <div class="card-item-text">${s.desktopApp}</div>
            </div>
          </div>

          <div class="card-actions">
            <a class="card-button free-button" @click="${o}">
              ${s.continueFree}
            </a>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">${s.premium}</div>
            <div class="card-subtitle">${s.premiumPrice}</div>
          </div>

          <div class="card-items">
            ${n?d.qy`
              <div class="card-item">
                <div class="card-item-icon">\u2705</div>
                <div class="card-item-text">${s.ruPremiumStable}</div>
              </div>`:""}
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.encryption}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.noAds}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.speed}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.servers}</div>
            </div>
            <div class="card-item">
              <div class="card-item-icon">\u2705</div>
              <div class="card-item-text">${s.desktopApp}</div>
            </div>
          </div>

          <div class="card-actions">
            <a class="card-button premium-button"
              href="${this.premiumLink}"
              target="_blank"
              @click="${l}">
              ${s.getPremium}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>`}var m=t(8987),u=t(8760),v=t(3602),f=t(8858),b=t(9845);class g extends d.WF{render(){return p.call(this)}static get properties(){return{premiumLink:{type:String}}}constructor(){super(),this.premiumLink="",(async()=>{const e=await m.A.getStateAsync(),i=await u.A.full.userIdPromise,t=await b.Pc.getEngagedEnabledExpvarid(),a=(0,r.A)();this.premiumLink=(0,f.u4)({action:e=>Object.assign(e,{utm_source:"chromium extension",utm_medium:"congrats_tab",utm_campaign:"default_campaign"}),storeState:e,url:`${v.A.base}/${a}/orders/new?plan_id=biennial&cid=${i}`,expvarid:t})})()}}customElements.define("compare-block",g);var x=t(8131);document.title=(0,a.A)("installed_compare_title"),(async()=>{let e=await x.A.get("congrats_number")||0;e++,c.A.track("congrats_tab_open",{congrats_number:e.toString()}),await x.A.set("congrats_number",e)})(),x.A.set("installCompareShown",!0);const _=new Promise((e=>{window.addEventListener("DOMContentLoaded",(()=>{e()}))}));(async e=>{await m.A.initiate();const i=(0,r.A)();window.language=i,"ru"===i&&document.documentElement.setAttribute("lang","ru"),await _;const t=document.querySelector("div.Main > div.In");null==t||null===(e=t.append)||void 0===e||e.call(t,document.createElement("compare-block"))})()}},t={};function a(e){var r=t[e];if(void 0!==r)return r.exports;var d=t[e]={id:e,loaded:!1,exports:{}};return i[e].call(d.exports,d,d.exports,a),d.loaded=!0,d.exports}a.m=i,e=[],a.O=(i,t,r,d)=>{if(!t){var c=1/0;for(l=0;l<e.length;l++){for(var[t,r,d]=e[l],s=!0,n=0;n<t.length;n++)(!1&d||c>=d)&&Object.keys(a.O).every((e=>a.O[e](t[n])))?t.splice(n--,1):(s=!1,d<c&&(c=d));if(s){e.splice(l--,1);var o=r();void 0!==o&&(i=o)}}return i}d=d||0;for(var l=e.length;l>0&&e[l-1][2]>d;l--)e[l]=e[l-1];e[l]=[t,r,d]},a.n=e=>{var i=e&&e.__esModule?()=>e.default:()=>e;return a.d(i,{a:i}),i},a.d=(e,i)=>{for(var t in i)a.o(i,t)&&!a.o(e,t)&&Object.defineProperty(e,t,{enumerable:!0,get:i[t]})},a.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"==typeof window)return window}}(),a.o=(e,i)=>Object.prototype.hasOwnProperty.call(e,i),a.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},a.nmd=e=>(e.paths=[],e.children||(e.children=[]),e),a.j=683,(()=>{var e={683:0};a.O.j=i=>0===e[i];var i=(i,t)=>{var r,d,[c,s,n]=t,o=0;if(c.some((i=>0!==e[i]))){for(r in s)a.o(s,r)&&(a.m[r]=s[r]);if(n)var l=n(a)}for(i&&i(t);o<c.length;o++)d=c[o],a.o(e,d)&&e[d]&&e[d][0](),e[d]=0;return a.O(l)},t=self.webpackChunkbrowsec_extension=self.webpackChunkbrowsec_extension||[];t.forEach(i.bind(null,0)),t.push=i.bind(null,t.push.bind(t))})();var r=a.O(void 0,[76],(()=>a(8775)));r=a.O(r)})();