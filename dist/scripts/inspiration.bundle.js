var y="fp_token",b="fp_user",g="fp_wedding_id",h={getActiveId(){return localStorage.getItem(g)},setActiveId(n){n?localStorage.setItem(g,n):localStorage.removeItem(g)},clear(){localStorage.removeItem(g)}},c={getToken(){return localStorage.getItem(y)},setToken(n){localStorage.setItem(y,n)},getUser(){try{return JSON.parse(localStorage.getItem(b))}catch{return null}},setUser(n){localStorage.setItem(b,JSON.stringify(n))},clearSession(){localStorage.removeItem(y),localStorage.removeItem(b),h.clear()},isLoggedIn(){return!!this.getToken()},async register({email:n,password:e,displayName:t}){let{data:a}=await _.post("/auth/register",{email:n,password:e,displayName:t});return c.setToken(a.token),c.setUser(a.user),a},async login({email:n,password:e}){let{data:t}=await _.post("/auth/login",{email:n,password:e});return c.setToken(t.token),c.setUser(t.user),t},logout(){c.clearSession(),window.location.href="/login.html"},requireAuth(){c.isLoggedIn()||(window.location.href="/login.html")}},v=class extends Error{constructor(e,t,a=[]){super(t),this.name="ApiResponseError",this.status=e,this.errors=a}},L="/api/v1",_={async request(n,{method:e="GET",body:t,query:a}={}){let o=`${L}${n}`;if(a&&Object.keys(a).length){let E=Object.fromEntries(Object.entries(a).filter(([,f])=>f!=null&&f!==""));Object.keys(E).length&&(o+="?"+new URLSearchParams(E).toString())}let i={"Content-Type":"application/json"},l=c.getToken();l&&(i.Authorization=`Bearer ${l}`);let s=h.getActiveId();s&&(i["X-Wedding-ID"]=s);let r=await fetch(o,{method:e,headers:i,body:t!==void 0?JSON.stringify(t):void 0});if(r.status===204)return{success:!0,data:null};let u=await r.json().catch(()=>({success:!1,message:`HTTP ${r.status}`,errors:[]}));if(!r.ok)throw r.status===401?(c.clearSession(),window.location.href="/login.html",new v(401,"Session expired. Please log in again.")):new v(r.status,u.message||`HTTP ${r.status}`,u.errors||[]);return u},get(n,e){return this.request(n,{method:"GET",query:e})},post(n,e){return this.request(n,{method:"POST",body:e})},put(n,e){return this.request(n,{method:"PUT",body:e})},patch(n,e){return this.request(n,{method:"PATCH",body:e})},delete(n){return this.request(n,{method:"DELETE"})}},p=_;var m=class n{static _container=null;static _getContainer(){return this._container||(this._container=document.createElement("div"),this._container.className="toast-container",this._container.setAttribute("aria-live","polite"),this._container.setAttribute("aria-atomic","true"),document.body.appendChild(this._container)),this._container}static show(e,t="default",a=2800){let o=document.createElement("div");o.className=`toast${t!=="default"?" "+t:""}`,o.textContent=e,this._getContainer().appendChild(o),setTimeout(()=>{o.style.opacity="0",o.style.transition="opacity .3s ease",setTimeout(()=>o.remove(),350)},a)}static showErrors(e=[]){e.length&&n.show(e.map(t=>t.msg).join(" \xB7 "),"error",4e3)}};function d(n){return String(n??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function x(){let n=window.location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".site-nav a").forEach(e=>{let t=e.getAttribute("href");e.classList.toggle("active",t===n||n===""&&t==="index.html")})}function k(){x();let n=document.getElementById("nav-user");if(n){let a=c.getUser();n.textContent=a?.display_name||a?.email||""}let e=document.getElementById("logout-btn");e&&e.addEventListener("click",a=>{a.preventDefault(),c.logout()});let t=document.querySelector(".site-nav");if(t&&!t.querySelector(".hamburger")){let a=t.querySelector(".brand"),o=[...t.querySelectorAll("a:not(.brand)")],i=t.querySelector(".nav-user-group");if(o.length&&a){let l=document.createElement("div");l.className="nav-links",o.forEach(r=>l.appendChild(r));let s=document.createElement("button");s.className="hamburger",s.setAttribute("aria-label","Toggle navigation menu"),s.setAttribute("aria-expanded","false"),s.innerHTML="<span></span><span></span><span></span>",a.after(s),i?(s.after(l),l.after(i)):s.after(l),s.addEventListener("click",r=>{r.stopPropagation();let u=l.classList.toggle("open");s.classList.toggle("open",u),s.setAttribute("aria-expanded",String(u))}),document.addEventListener("click",r=>{!t.contains(r.target)&&l.classList.contains("open")&&(l.classList.remove("open"),s.classList.remove("open"),s.setAttribute("aria-expanded","false"))}),l.addEventListener("click",r=>{r.target.tagName==="A"&&(l.classList.remove("open"),s.classList.remove("open"),s.setAttribute("aria-expanded","false"))})}}$()}async function $(){try{let{data:n}=await p.get("/weddings"),e=n.weddings||[];if(!e.length)return;h.getActiveId()||h.setActiveId(e[0].id),A(e)}catch{}}function A(n){let e=document.querySelector(".site-nav");if(!e||e.querySelector(".wedding-switcher"))return;let t=h.getActiveId()||n[0].id,a=document.createElement("select");a.className="wedding-switcher",a.setAttribute("aria-label","Switch wedding"),a.title="Switch wedding",n.forEach(r=>{let u=document.createElement("option");u.value=r.id,u.textContent=r.name,u.selected=r.id===t,a.appendChild(u)});let o=document.createElement("option");o.disabled=!0,o.textContent="\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",a.appendChild(o);let i=document.createElement("option");i.value="__join__",i.textContent="+ Join another\u2026",a.appendChild(i),a.addEventListener("change",()=>{let r=a.value;if(r==="__join__"){a.value=t,T();return}h.setActiveId(r),location.reload()});let l=e.querySelector(".brand"),s=e.querySelector(".hamburger");s?e.insertBefore(a,s):l.after(a)}async function T(n=null){document.getElementById("fp-invite-modal")?.remove();let e=n;if(e===null)try{let{data:s}=await p.get("/weddings/my-pending-invites");e=s.invites||[]}catch{e=[]}let t=document.createElement("div");t.id="fp-invite-modal",t.className="modal-overlay";let a=e.length>0;t.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fp-modal-title">
      <div class="modal-header">
        <h2 id="fp-modal-title" class="modal-title">
          ${a?"\u{1F48C} Pending Invitations":"\u{1F48D} Join a Wedding"}
        </h2>
        <button class="modal-close" aria-label="Close">\u2715</button>
      </div>

      ${a?`
        <div class="modal-invites">
          ${e.map(s=>`
            <div class="modal-invite-card" data-token="${d(s.token)}">
              <div class="modal-invite-info">
                <strong>${d(s.wedding_name)}</strong>
                <span class="modal-invite-meta">
                  From ${d(s.invited_by_name)} \xB7 ${d(s.role)}
                </span>
              </div>
              <button class="btn btn-primary accept-invite-btn"
                      style="padding:6px 16px;font-size:.82rem;white-space:nowrap;">
                Accept
              </button>
            </div>
          `).join("")}
        </div>
        <div class="modal-divider"><span>or paste a link</span></div>
      `:`
        <p class="modal-desc">
          Paste an invite link or token shared with you to join a wedding.
        </p>
      `}

      <div class="modal-token-row">
        <input type="text" id="fp-modal-input" class="modal-token-input"
               placeholder="https://\u2026?token=\u2026 or raw UUID" autocomplete="off" />
        <button class="btn btn-primary" id="fp-modal-join-btn">Join</button>
      </div>
      <p class="modal-error" id="fp-modal-error"></p>

      <button class="btn btn-ghost btn-full" id="fp-modal-dismiss"
              style="margin-top:12px;font-size:.85rem;">Not now</button>
    </div>
  `,document.body.appendChild(t);let o=t.querySelector("#fp-modal-input"),i=t.querySelector("#fp-modal-join-btn"),l=()=>t.remove();t.querySelector(".modal-close").addEventListener("click",l),t.querySelector("#fp-modal-dismiss").addEventListener("click",l),t.addEventListener("click",s=>{s.target===t&&l()}),t.querySelectorAll(".accept-invite-btn").forEach(s=>{s.addEventListener("click",()=>{let r=s.closest("[data-token]").dataset.token;S(r,s,t)})}),i.addEventListener("click",()=>{let s=C(o.value.trim());if(!s){I(t,"Please paste a valid invite link or UUID token.");return}S(s,i,t)}),o.addEventListener("keydown",s=>{s.key==="Enter"&&i.click()}),o.focus()}function C(n){let e=n.match(/[?&]token=([0-9a-f-]{36})/i);return e?e[1]:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n)?n:null}async function S(n,e,t){let a=e.textContent;e.disabled=!0,e.textContent="Joining\u2026";try{await p.post(`/weddings/invites/${n}/accept`);let{data:o}=await p.get("/weddings"),i=o.weddings||[],l=i.find(s=>s.role!=="owner")??i.at(-1);l&&h.setActiveId(l.id),t.remove(),m.show(`Joined "${l?.name??"wedding"}"! \u{1F389}`,"success"),setTimeout(()=>location.reload(),900)}catch(o){e.disabled=!1,e.textContent=a;let i=o.status===404?"Invite not found or has expired.":o.status===409?"You already belong to this wedding.":o.message||"Could not accept invite.";I(t,i)}}function I(n,e){let t=n.querySelector("#fp-modal-error");t.textContent=e}c.requireAuth();var w=class{constructor(){this._searchInput=document.getElementById("inspo-search-input"),this._searchBtn=document.getElementById("inspo-search-btn"),this._resultsEl=document.getElementById("inspo-results"),this._savedGrid=document.getElementById("saved-grid"),this._savedCount=document.getElementById("saved-count"),this._emptyState=document.getElementById("board-empty")}async init(){k(),this._bindEvents(),await this._loadBoard()}_bindEvents(){this._searchBtn.addEventListener("click",()=>this._search()),this._searchInput.addEventListener("keydown",e=>{e.key==="Enter"&&this._search()}),document.querySelectorAll(".suggestion-btn").forEach(e=>e.addEventListener("click",()=>{this._searchInput.value=e.dataset.q,this._search()}))}async _search(){let e=this._searchInput.value.trim();if(!e)return m.show("Enter a search term.","error");this._resultsEl.innerHTML=`
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> Searching Unsplash\u2026
      </div>`;try{let{data:t}=await p.get("/inspiration/search",{q:e,per_page:18}),a=t.results??[];if(!a.length){this._resultsEl.innerHTML=`
          <p style="color:var(--text-muted);padding:12px 0">
            No images found for "${d(e)}".
          </p>`;return}this._resultsEl.innerHTML=`
        <div class="inspo-grid" role="list" aria-label="Search results" style="margin-top:16px">
          ${a.map(o=>this._resultCard(o)).join("")}
        </div>`,this._resultsEl.querySelectorAll(".inspo-save-btn").forEach(o=>{o.addEventListener("click",()=>{let i=o.closest("[data-photo-id]");this._save({photoId:i.dataset.photoId,thumbUrl:i.dataset.thumb,fullUrl:i.dataset.full,altDesc:i.dataset.alt||void 0,sourceLink:i.dataset.link||void 0})})})}catch{this._resultsEl.innerHTML=`
        <p style="color:var(--danger);padding:12px 0">
          Search failed. Please check your connection and try again.
        </p>`}}_resultCard(e){let t=e.urls?.thumb||"",a=e.urls?.regular||e.urls?.full||t,o=e.alt_description||e.description||"Wedding inspiration photo",i=e.links?.html||"#";return`
      <div class="inspo-card" role="listitem"
           data-photo-id="${d(e.id)}"
           data-thumb="${d(t)}"
           data-full="${d(a)}"
           data-alt="${d(o)}"
           data-link="${d(i)}">
        <img src="${d(t)}" alt="${d(o)}" loading="lazy" />
        <div class="inspo-overlay">
          <button class="inspo-save-btn" aria-label="Save: ${d(o)}">
            \u2665 Save
          </button>
        </div>
      </div>`}async _save(e){try{await p.post("/inspiration",e),m.show("Saved to your inspiration board! \u{1F338}","success"),await this._loadBoard()}catch(t){if(t.status===409)return m.show("Already saved to your board!");m.show(t.message||"Could not save photo.","error")}}async _remove(e){try{await p.delete(`/inspiration/${e}`),m.show("Removed from board."),await this._loadBoard()}catch(t){m.show(t.message||"Could not remove photo.","error")}}async _loadBoard(){try{let{data:e}=await p.get("/inspiration");this._renderBoard(e.photos)}catch{m.show("Could not load inspiration board.","error")}}_renderBoard(e){this._emptyState.hidden=e.length>0,this._savedCount.textContent=e.length?`(${e.length} saved)`:"",this._savedGrid.innerHTML=e.map(t=>`
      <div class="inspo-card" data-id="${d(t.id)}"
           role="img" aria-label="${d(t.alt_desc||"Saved inspiration image")}">
        <a href="${d(t.full_url)}" target="_blank" rel="noopener noreferrer"
           aria-label="View full size: ${d(t.alt_desc||"photo")}">
          <img src="${d(t.thumb_url)}"
               alt="${d(t.alt_desc||"Saved inspiration image")}" loading="lazy" />
        </a>
        <button class="inspo-remove-btn remove-saved-btn"
                aria-label="Remove from board">\u2715</button>
      </div>`).join(""),this._savedGrid.querySelectorAll(".remove-saved-btn").forEach(t=>t.addEventListener("click",()=>this._remove(t.closest("[data-id]").dataset.id)))}};document.addEventListener("DOMContentLoaded",()=>{new w().init()});
