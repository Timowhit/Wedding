var y="fp_token",w="fp_user",g="fp_wedding_id",h={getActiveId(){return localStorage.getItem(g)},setActiveId(n){n?localStorage.setItem(g,n):localStorage.removeItem(g)},clear(){localStorage.removeItem(g)}},d={getToken(){return localStorage.getItem(y)},setToken(n){localStorage.setItem(y,n)},getUser(){try{return JSON.parse(localStorage.getItem(w))}catch{return null}},setUser(n){localStorage.setItem(w,JSON.stringify(n))},clearSession(){localStorage.removeItem(y),localStorage.removeItem(w),h.clear()},isLoggedIn(){return!!this.getToken()},async register({email:n,password:e,displayName:t}){let{data:s}=await k.post("/auth/register",{email:n,password:e,displayName:t});return d.setToken(s.token),d.setUser(s.user),s},async login({email:n,password:e}){let{data:t}=await k.post("/auth/login",{email:n,password:e});return d.setToken(t.token),d.setUser(t.user),t},logout(){d.clearSession(),window.location.href="/login.html"},requireAuth(){d.isLoggedIn()||(window.location.href="/login.html")}},v=class extends Error{constructor(e,t,s=[]){super(t),this.name="ApiResponseError",this.status=e,this.errors=s}},x="/api/v1",k={async request(n,{method:e="GET",body:t,query:s}={}){let i=`${x}${n}`;if(s&&Object.keys(s).length){let _=Object.fromEntries(Object.entries(s).filter(([,f])=>f!=null&&f!==""));Object.keys(_).length&&(i+="?"+new URLSearchParams(_).toString())}let o={"Content-Type":"application/json"},r=d.getToken();r&&(o.Authorization=`Bearer ${r}`);let a=h.getActiveId();a&&(o["X-Wedding-ID"]=a);let l=await fetch(i,{method:e,headers:o,body:t!==void 0?JSON.stringify(t):void 0});if(l.status===204)return{success:!0,data:null};let u=await l.json().catch(()=>({success:!1,message:`HTTP ${l.status}`,errors:[]}));if(!l.ok)throw l.status===401?(d.clearSession(),window.location.href="/login.html",new v(401,"Session expired. Please log in again.")):new v(l.status,u.message||`HTTP ${l.status}`,u.errors||[]);return u},get(n,e){return this.request(n,{method:"GET",query:e})},post(n,e){return this.request(n,{method:"POST",body:e})},put(n,e){return this.request(n,{method:"PUT",body:e})},patch(n,e){return this.request(n,{method:"PATCH",body:e})},delete(n){return this.request(n,{method:"DELETE"})}},p=k;var m=class n{static _container=null;static _getContainer(){return this._container||(this._container=document.createElement("div"),this._container.className="toast-container",this._container.setAttribute("aria-live","polite"),this._container.setAttribute("aria-atomic","true"),document.body.appendChild(this._container)),this._container}static show(e,t="default",s=2800){let i=document.createElement("div");i.className=`toast${t!=="default"?" "+t:""}`,i.textContent=e,this._getContainer().appendChild(i),setTimeout(()=>{i.style.opacity="0",i.style.transition="opacity .3s ease",setTimeout(()=>i.remove(),350)},s)}static showErrors(e=[]){e.length&&n.show(e.map(t=>t.msg).join(" \xB7 "),"error",4e3)}};function c(n){return String(n??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function I(){let n=window.location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".site-nav a").forEach(e=>{let t=e.getAttribute("href");e.classList.toggle("active",t===n||n===""&&t==="index.html")})}function S(){I();let n=document.getElementById("nav-user");if(n){let s=d.getUser();n.textContent=s?.display_name||s?.email||""}let e=document.getElementById("logout-btn");e&&e.addEventListener("click",s=>{s.preventDefault(),d.logout()});let t=document.querySelector(".site-nav");if(t&&!t.querySelector(".hamburger")){let s=t.querySelector(".brand"),i=[...t.querySelectorAll("a:not(.brand)")],o=t.querySelector(".nav-user-group");if(i.length&&s){let r=document.createElement("div");r.className="nav-links",i.forEach(l=>r.appendChild(l));let a=document.createElement("button");a.className="hamburger",a.setAttribute("aria-label","Toggle navigation menu"),a.setAttribute("aria-expanded","false"),a.innerHTML="<span></span><span></span><span></span>",s.after(a),o?(a.after(r),r.after(o)):a.after(r),a.addEventListener("click",l=>{l.stopPropagation();let u=r.classList.toggle("open");a.classList.toggle("open",u),a.setAttribute("aria-expanded",String(u))}),document.addEventListener("click",l=>{!t.contains(l.target)&&r.classList.contains("open")&&(r.classList.remove("open"),a.classList.remove("open"),a.setAttribute("aria-expanded","false"))}),r.addEventListener("click",l=>{l.target.tagName==="A"&&(r.classList.remove("open"),a.classList.remove("open"),a.setAttribute("aria-expanded","false"))})}}L()}async function L(){try{let{data:n}=await p.get("/weddings"),e=n.weddings||[];if(!e.length)return;h.getActiveId()||h.setActiveId(e[0].id),T(e)}catch{}}function T(n){let e=document.querySelector(".site-nav");if(!e||e.querySelector(".wedding-switcher"))return;let t=h.getActiveId()||n[0].id,s=document.createElement("select");s.className="wedding-switcher",s.setAttribute("aria-label","Switch wedding"),s.title="Switch wedding",n.forEach(l=>{let u=document.createElement("option");u.value=l.id,u.textContent=l.name,u.selected=l.id===t,s.appendChild(u)});let i=document.createElement("option");i.disabled=!0,i.textContent="\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",s.appendChild(i);let o=document.createElement("option");o.value="__join__",o.textContent="+ Join another\u2026",s.appendChild(o),s.addEventListener("change",()=>{let l=s.value;if(l==="__join__"){s.value=t,A();return}h.setActiveId(l),location.reload()});let r=e.querySelector(".brand"),a=e.querySelector(".hamburger");a?e.insertBefore(s,a):r.after(s)}async function A(n=null){document.getElementById("fp-invite-modal")?.remove();let e=n;if(e===null)try{let{data:a}=await p.get("/weddings/my-pending-invites");e=a.invites||[]}catch{e=[]}let t=document.createElement("div");t.id="fp-invite-modal",t.className="modal-overlay";let s=e.length>0;t.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fp-modal-title">
      <div class="modal-header">
        <h2 id="fp-modal-title" class="modal-title">
          ${s?"\u{1F48C} Pending Invitations":"\u{1F48D} Join a Wedding"}
        </h2>
        <button class="modal-close" aria-label="Close">\u2715</button>
      </div>

      ${s?`
        <div class="modal-invites">
          ${e.map(a=>`
            <div class="modal-invite-card" data-token="${c(a.token)}">
              <div class="modal-invite-info">
                <strong>${c(a.wedding_name)}</strong>
                <span class="modal-invite-meta">
                  From ${c(a.invited_by_name)} \xB7 ${c(a.role)}
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
  `,document.body.appendChild(t);let i=t.querySelector("#fp-modal-input"),o=t.querySelector("#fp-modal-join-btn"),r=()=>t.remove();t.querySelector(".modal-close").addEventListener("click",r),t.querySelector("#fp-modal-dismiss").addEventListener("click",r),t.addEventListener("click",a=>{a.target===t&&r()}),t.querySelectorAll(".accept-invite-btn").forEach(a=>{a.addEventListener("click",()=>{let l=a.closest("[data-token]").dataset.token;E(l,a,t)})}),o.addEventListener("click",()=>{let a=C(i.value.trim());if(!a){$(t,"Please paste a valid invite link or UUID token.");return}E(a,o,t)}),i.addEventListener("keydown",a=>{a.key==="Enter"&&o.click()}),i.focus()}function C(n){let e=n.match(/[?&]token=([0-9a-f-]{36})/i);return e?e[1]:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n)?n:null}async function E(n,e,t){let s=e.textContent;e.disabled=!0,e.textContent="Joining\u2026";try{await p.post(`/weddings/invites/${n}/accept`);let{data:i}=await p.get("/weddings"),o=i.weddings||[],r=o.find(a=>a.role!=="owner")??o.at(-1);r&&h.setActiveId(r.id),t.remove(),m.show(`Joined "${r?.name??"wedding"}"! \u{1F389}`,"success"),setTimeout(()=>location.reload(),900)}catch(i){e.disabled=!1,e.textContent=s;let o=i.status===404?"Invite not found or has expired.":i.status===409?"You already belong to this wedding.":i.message||"Could not accept invite.";$(t,o)}}function $(n,e){let t=n.querySelector("#fp-modal-error");t.textContent=e}d.requireAuth();var b=class{constructor(){this._searchInput=document.getElementById("music-search-input"),this._sectionSelect=document.getElementById("music-section-select"),this._searchBtn=document.getElementById("music-search-btn"),this._resultsEl=document.getElementById("music-results"),this._playlistEl=document.getElementById("playlist-container"),this._emptyState=document.getElementById("playlist-empty")}async init(){S(),this._bindEvents(),await this._loadPlaylists()}_bindEvents(){this._searchBtn.addEventListener("click",()=>this._search()),this._searchInput.addEventListener("keydown",e=>{e.key==="Enter"&&this._search()})}async _search(){let e=this._searchInput.value.trim();if(!e)return m.show("Enter a song or artist to search.","error");this._resultsEl.innerHTML=`
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> Searching iTunes\u2026
      </div>`;try{let{data:t}=await p.get("/music/search",{q:e,limit:12}),s=t.results??[];if(!s.length){this._resultsEl.innerHTML=`
          <p style="color:var(--text-muted);padding:12px 0">
            No results found for "${c(e)}".
          </p>`;return}let i=this._sectionSelect.value;this._resultsEl.innerHTML=`
        <div class="music-results" role="list" aria-label="Search results">
          ${s.map(o=>this._trackCard(o,i)).join("")}
        </div>`,this._resultsEl.querySelectorAll(".add-track-btn").forEach(o=>{o.addEventListener("click",()=>{let r=o.closest("[data-track-id]");this._addTrack({section:i,trackId:r.dataset.trackId,trackName:r.dataset.trackName,artistName:r.dataset.artistName,artworkUrl:r.dataset.artwork||void 0,previewUrl:r.dataset.preview||void 0})})})}catch{this._resultsEl.innerHTML=`
        <p style="color:var(--danger);padding:12px 0">
          Search failed. Please check your connection and try again.
        </p>`}}_trackCard(e,t){let s=e.artworkUrl60||"";return`
      <div class="music-result-card" role="listitem"
           data-track-id="${c(String(e.trackId))}"
           data-track-name="${c(e.trackName||"")}"
           data-artist-name="${c(e.artistName||"")}"
           data-artwork="${c(s)}"
           data-preview="${c(e.previewUrl||"")}">
        ${s?`<img class="music-artwork" src="${c(s)}"
                  alt="${c(e.trackName)} artwork" loading="lazy" />`:`<div class="music-artwork" style="background:var(--surface-2);display:flex;
                  align-items:center;justify-content:center;font-size:1.3rem" aria-hidden="true">\u{1F3B5}</div>`}
        <div class="music-info">
          <div class="music-title">${c(e.trackName||"Unknown")}</div>
          <div class="music-artist">${c(e.artistName||"Unknown Artist")}</div>
        </div>
        <button class="btn btn-primary add-track-btn"
                style="padding:6px 12px;font-size:.8rem;white-space:nowrap;"
                aria-label="Add ${c(e.trackName)} to ${c(t)}">
          + Add
        </button>
      </div>`}async _addTrack(e){try{await p.post("/music/tracks",e),m.show(`Added to ${e.section}!`,"success"),await this._loadPlaylists()}catch(t){if(t.status===409)return m.show(`Already in ${e.section}.`);m.show(t.message||"Could not add track.","error")}}async _removeTrack(e){try{await p.delete(`/music/tracks/${e}`),m.show("Track removed."),await this._loadPlaylists()}catch(t){m.show(t.message||"Could not remove track.","error")}}async _loadPlaylists(){try{let{data:e}=await p.get("/music");this._renderPlaylists(e.playlists,e.sections)}catch{m.show("Could not load playlists.","error")}}_renderPlaylists(e,t){let s=Object.values(e).reduce((i,o)=>i+o.length,0);this._emptyState.hidden=s>0,this._playlistEl.innerHTML=t.map(i=>{let o=e[i]??[];if(!o.length)return"";let r=i.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");return`
        <div class="playlist-section card" aria-labelledby="sec-${r}">
          <div class="playlist-section-header">
            <h3 class="card-title" id="sec-${r}" style="border:none;padding:0;margin:0;">
              \u{1F3B5} ${c(i)}
              <span style="font-size:.85rem;font-weight:400;color:var(--text-muted)">
                (${o.length} song${o.length!==1?"s":""})
              </span>
            </h3>
          </div>
          <ul class="item-list" aria-label="${c(i)} playlist">
            ${o.map(a=>`
              <li class="item-card music-result-card" data-id="${c(a.id)}" style="gap:10px">
                ${a.artwork_url?`<img class="music-artwork" src="${c(a.artwork_url)}"
                          alt="${c(a.track_name)} artwork" loading="lazy" />`:`<div class="music-artwork" style="background:var(--surface-2);
                          display:flex;align-items:center;justify-content:center;
                          font-size:1.2rem" aria-hidden="true">\u{1F3B5}</div>`}
                <div class="music-info">
                  <div class="music-title" style="font-size:.9rem">
                    ${c(a.track_name||"Unknown")}
                  </div>
                  <div class="music-artist">${c(a.artist_name||"")}</div>
                </div>
                ${a.preview_url?`<a href="${c(a.preview_url)}" target="_blank" rel="noopener noreferrer"
                        class="btn btn-ghost" style="padding:4px 10px;font-size:.78rem"
                        aria-label="Preview ${c(a.track_name)}">\u25B6 Preview</a>`:""}
                <button class="btn btn-danger remove-track-btn"
                        aria-label="Remove ${c(a.track_name)}">\u2715</button>
              </li>`).join("")}
          </ul>
        </div>`}).join(""),this._playlistEl.querySelectorAll(".remove-track-btn").forEach(i=>i.addEventListener("click",()=>this._removeTrack(i.closest("[data-id]").dataset.id)))}};document.addEventListener("DOMContentLoaded",()=>{new b().init()});
