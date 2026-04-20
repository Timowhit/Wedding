var g="fp_token",y="fp_user",c={getToken(){return localStorage.getItem(g)},setToken(s){localStorage.setItem(g,s)},getUser(){try{return JSON.parse(localStorage.getItem(y))}catch{return null}},setUser(s){localStorage.setItem(y,JSON.stringify(s))},clearSession(){localStorage.removeItem(g),localStorage.removeItem(y)},isLoggedIn(){return!!this.getToken()},async register({email:s,password:t,displayName:e}){let{data:r}=await v.post("/auth/register",{email:s,password:t,displayName:e});return c.setToken(r.token),c.setUser(r.user),r},async login({email:s,password:t}){let{data:e}=await v.post("/auth/login",{email:s,password:t});return c.setToken(e.token),c.setUser(e.user),e},logout(){c.clearSession(),window.location.href="/login.html"},requireAuth(){c.isLoggedIn()||(window.location.href="/login.html")}},m=class extends Error{constructor(t,e,r=[]){super(e),this.name="ApiResponseError",this.status=t,this.errors=r}},_="/api/v1",v={async request(s,{method:t="GET",body:e,query:r}={}){let n=`${_}${s}`;if(r&&Object.keys(r).length){let w=Object.fromEntries(Object.entries(r).filter(([,p])=>p!=null&&p!==""));Object.keys(w).length&&(n+="?"+new URLSearchParams(w).toString())}let o={"Content-Type":"application/json"},l=c.getToken();l&&(o.Authorization=`Bearer ${l}`);let i=await fetch(n,{method:t,headers:o,body:e!==void 0?JSON.stringify(e):void 0});if(i.status===204)return{success:!0,data:null};let h=await i.json().catch(()=>({success:!1,message:`HTTP ${i.status}`,errors:[]}));if(!i.ok)throw i.status===401?(c.clearSession(),window.location.href="/login.html",new m(401,"Session expired. Please log in again.")):new m(i.status,h.message||`HTTP ${i.status}`,h.errors||[]);return h},get(s,t){return this.request(s,{method:"GET",query:t})},post(s,t){return this.request(s,{method:"POST",body:t})},put(s,t){return this.request(s,{method:"PUT",body:t})},patch(s,t){return this.request(s,{method:"PATCH",body:t})},delete(s){return this.request(s,{method:"DELETE"})}},u=v;var d=class s{static _container=null;static _getContainer(){return this._container||(this._container=document.createElement("div"),this._container.className="toast-container",this._container.setAttribute("aria-live","polite"),this._container.setAttribute("aria-atomic","true"),document.body.appendChild(this._container)),this._container}static show(t,e="default",r=2800){let n=document.createElement("div");n.className=`toast${e!=="default"?" "+e:""}`,n.textContent=t,this._getContainer().appendChild(n),setTimeout(()=>{n.style.opacity="0",n.style.transition="opacity .3s ease",setTimeout(()=>n.remove(),350)},r)}static showErrors(t=[]){if(!t.length)return;let e=t.map(r=>r.msg).join(" \xB7 ");s.show(e,"error",4e3)}};function a(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function E(){let s=window.location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".site-nav a").forEach(t=>{let e=t.getAttribute("href");t.classList.toggle("active",e===s||s===""&&e==="index.html")})}function k(){E();let s=document.getElementById("nav-user");if(s){let e=c.getUser();s.textContent=e?.display_name||e?.email||""}let t=document.getElementById("logout-btn");t&&t.addEventListener("click",e=>{e.preventDefault(),c.logout()})}c.requireAuth();var f=class{constructor(){this._searchInput=document.getElementById("music-search-input"),this._sectionSelect=document.getElementById("music-section-select"),this._searchBtn=document.getElementById("music-search-btn"),this._resultsEl=document.getElementById("music-results"),this._playlistEl=document.getElementById("playlist-container"),this._emptyState=document.getElementById("playlist-empty")}async init(){k(),this._bindEvents(),await this._loadPlaylists()}_bindEvents(){this._searchBtn.addEventListener("click",()=>this._search()),this._searchInput.addEventListener("keydown",t=>{t.key==="Enter"&&this._search()})}async _search(){let t=this._searchInput.value.trim();if(!t)return d.show("Enter a song or artist to search.","error");this._resultsEl.innerHTML=`
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> Searching iTunes\u2026
      </div>`;try{let{data:e}=await u.get("/music/search",{q:t,limit:12}),r=e.results??[];if(!r.length){this._resultsEl.innerHTML=`
          <p style="color:var(--text-muted);padding:12px 0">
            No results found for "${a(t)}".
          </p>`;return}let n=this._sectionSelect.value;this._resultsEl.innerHTML=`
        <div class="music-results" role="list" aria-label="Search results">
          ${r.map(o=>this._trackCard(o,n)).join("")}
        </div>`,this._resultsEl.querySelectorAll(".add-track-btn").forEach(o=>{o.addEventListener("click",()=>{let l=o.closest("[data-track-id]");this._addTrack({section:n,trackId:l.dataset.trackId,trackName:l.dataset.trackName,artistName:l.dataset.artistName,artworkUrl:l.dataset.artwork||void 0,previewUrl:l.dataset.preview||void 0})})})}catch{this._resultsEl.innerHTML=`
        <p style="color:var(--danger);padding:12px 0">
          Search failed. Please check your connection and try again.
        </p>`}}_trackCard(t,e){let r=t.artworkUrl60||"";return`
      <div class="music-result-card" role="listitem"
           data-track-id="${a(String(t.trackId))}"
           data-track-name="${a(t.trackName||"")}"
           data-artist-name="${a(t.artistName||"")}"
           data-artwork="${a(r)}"
           data-preview="${a(t.previewUrl||"")}">
        ${r?`<img class="music-artwork" src="${a(r)}"
                  alt="${a(t.trackName)} artwork" loading="lazy" />`:`<div class="music-artwork" style="background:var(--surface-2);display:flex;
                  align-items:center;justify-content:center;font-size:1.3rem" aria-hidden="true">\u{1F3B5}</div>`}
        <div class="music-info">
          <div class="music-title">${a(t.trackName||"Unknown")}</div>
          <div class="music-artist">${a(t.artistName||"Unknown Artist")}</div>
        </div>
        <button class="btn btn-primary add-track-btn"
                style="padding:6px 12px;font-size:.8rem;white-space:nowrap;"
                aria-label="Add ${a(t.trackName)} to ${a(e)}">
          + Add
        </button>
      </div>`}async _addTrack(t){try{await u.post("/music/tracks",t),d.show(`Added to ${t.section}!`,"success"),await this._loadPlaylists()}catch(e){if(e.status===409)return d.show(`Already in ${t.section}.`);d.show(e.message||"Could not add track.","error")}}async _removeTrack(t){try{await u.delete(`/music/tracks/${t}`),d.show("Track removed."),await this._loadPlaylists()}catch(e){d.show(e.message||"Could not remove track.","error")}}async _loadPlaylists(){try{let{data:t}=await u.get("/music");this._renderPlaylists(t.playlists,t.sections)}catch{d.show("Could not load playlists.","error")}}_renderPlaylists(t,e){let r=Object.values(t).reduce((n,o)=>n+o.length,0);this._emptyState.hidden=r>0,this._playlistEl.innerHTML=e.map(n=>{let o=t[n]??[];if(!o.length)return"";let l=n.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");return`
        <div class="playlist-section card" aria-labelledby="sec-${l}">
          <div class="playlist-section-header">
            <h3 class="card-title" id="sec-${l}" style="border:none;padding:0;margin:0;">
              \u{1F3B5} ${a(n)}
              <span style="font-size:.85rem;font-weight:400;color:var(--text-muted)">
                (${o.length} song${o.length!==1?"s":""})
              </span>
            </h3>
          </div>
          <ul class="item-list" aria-label="${a(n)} playlist">
            ${o.map(i=>`
              <li class="item-card music-result-card" data-id="${a(i.id)}" style="gap:10px">
                ${i.artwork_url?`<img class="music-artwork" src="${a(i.artwork_url)}"
                          alt="${a(i.track_name)} artwork" loading="lazy" />`:`<div class="music-artwork" style="background:var(--surface-2);
                          display:flex;align-items:center;justify-content:center;
                          font-size:1.2rem" aria-hidden="true">\u{1F3B5}</div>`}
                <div class="music-info">
                  <div class="music-title" style="font-size:.9rem">
                    ${a(i.track_name||"Unknown")}
                  </div>
                  <div class="music-artist">${a(i.artist_name||"")}</div>
                </div>
                ${i.preview_url?`<a href="${a(i.preview_url)}" target="_blank" rel="noopener noreferrer"
                        class="btn btn-ghost" style="padding:4px 10px;font-size:.78rem"
                        aria-label="Preview ${a(i.track_name)}">\u25B6 Preview</a>`:""}
                <button class="btn btn-danger remove-track-btn"
                        aria-label="Remove ${a(i.track_name)}">\u2715</button>
              </li>`).join("")}
          </ul>
        </div>`}).join(""),this._playlistEl.querySelectorAll(".remove-track-btn").forEach(n=>n.addEventListener("click",()=>this._removeTrack(n.closest("[data-id]").dataset.id)))}};document.addEventListener("DOMContentLoaded",()=>{new f().init()});
