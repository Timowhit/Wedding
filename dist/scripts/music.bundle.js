var v="fp_token",f="fp_user",l={getToken(){return localStorage.getItem(v)},setToken(a){localStorage.setItem(v,a)},getUser(){try{return JSON.parse(localStorage.getItem(f))}catch{return null}},setUser(a){localStorage.setItem(f,JSON.stringify(a))},clearSession(){localStorage.removeItem(v),localStorage.removeItem(f)},isLoggedIn(){return!!this.getToken()},async register({email:a,password:t,displayName:e}){let{data:r}=await y.post("/auth/register",{email:a,password:t,displayName:e});return l.setToken(r.token),l.setUser(r.user),r},async login({email:a,password:t}){let{data:e}=await y.post("/auth/login",{email:a,password:t});return l.setToken(e.token),l.setUser(e.user),e},logout(){l.clearSession(),window.location.href="/login.html"},requireAuth(){l.isLoggedIn()||(window.location.href="/login.html")}},p=class extends Error{constructor(t,e,r=[]){super(e),this.name="ApiResponseError",this.status=t,this.errors=r}},_="/api/v1",y={async request(a,{method:t="GET",body:e,query:r}={}){let n=`${_}${a}`;if(r&&Object.keys(r).length){let m=Object.fromEntries(Object.entries(r).filter(([,g])=>g!=null&&g!==""));Object.keys(m).length&&(n+="?"+new URLSearchParams(m).toString())}let c={"Content-Type":"application/json"},o=l.getToken();o&&(c.Authorization=`Bearer ${o}`);let s=await fetch(n,{method:t,headers:c,body:e!==void 0?JSON.stringify(e):void 0});if(s.status===204)return{success:!0,data:null};let d=await s.json().catch(()=>({success:!1,message:`HTTP ${s.status}`,errors:[]}));if(!s.ok)throw s.status===401?(l.clearSession(),window.location.href="/login.html",new p(401,"Session expired. Please log in again.")):new p(s.status,d.message||`HTTP ${s.status}`,d.errors||[]);return d},get(a,t){return this.request(a,{method:"GET",query:t})},post(a,t){return this.request(a,{method:"POST",body:t})},put(a,t){return this.request(a,{method:"PUT",body:t})},patch(a,t){return this.request(a,{method:"PATCH",body:t})},delete(a){return this.request(a,{method:"DELETE"})}},h=y;var u=class a{static _container=null;static _getContainer(){return this._container||(this._container=document.createElement("div"),this._container.className="toast-container",this._container.setAttribute("aria-live","polite"),this._container.setAttribute("aria-atomic","true"),document.body.appendChild(this._container)),this._container}static show(t,e="default",r=2800){let n=document.createElement("div");n.className=`toast${e!=="default"?" "+e:""}`,n.textContent=t,this._getContainer().appendChild(n),setTimeout(()=>{n.style.opacity="0",n.style.transition="opacity .3s ease",setTimeout(()=>n.remove(),350)},r)}static showErrors(t=[]){if(!t.length)return;let e=t.map(r=>r.msg).join(" \xB7 ");a.show(e,"error",4e3)}};function i(a){return String(a??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function E(){let a=window.location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".site-nav a").forEach(t=>{let e=t.getAttribute("href");t.classList.toggle("active",e===a||a===""&&e==="index.html")})}function w(){E();let a=document.getElementById("nav-user");if(a){let r=l.getUser();a.textContent=r?.display_name||r?.email||""}let t=document.getElementById("logout-btn");t&&t.addEventListener("click",r=>{r.preventDefault(),l.logout()});let e=document.querySelector(".site-nav");if(e&&!e.querySelector(".hamburger")){let r=e.querySelector(".brand"),n=e.querySelector(".nav-user-group"),c=[...e.querySelectorAll("a:not(.brand)")];if(c.length&&r){let o=document.createElement("div");o.className="nav-links",c.forEach(d=>o.appendChild(d));let s=document.createElement("button");s.className="hamburger",s.setAttribute("aria-label","Toggle navigation menu"),s.setAttribute("aria-expanded","false"),s.innerHTML="<span></span><span></span><span></span>",r.after(s),n?(s.after(n),n.after(o)):s.after(o),s.addEventListener("click",d=>{d.stopPropagation();let m=o.classList.toggle("open");s.classList.toggle("open",m),s.setAttribute("aria-expanded",String(m))}),document.addEventListener("click",d=>{!e.contains(d.target)&&o.classList.contains("open")&&(o.classList.remove("open"),s.classList.remove("open"),s.setAttribute("aria-expanded","false"))}),o.addEventListener("click",d=>{d.target.tagName==="A"&&(o.classList.remove("open"),s.classList.remove("open"),s.setAttribute("aria-expanded","false"))})}}}l.requireAuth();var k=class{constructor(){this._searchInput=document.getElementById("music-search-input"),this._sectionSelect=document.getElementById("music-section-select"),this._searchBtn=document.getElementById("music-search-btn"),this._resultsEl=document.getElementById("music-results"),this._playlistEl=document.getElementById("playlist-container"),this._emptyState=document.getElementById("playlist-empty")}async init(){w(),this._bindEvents(),await this._loadPlaylists()}_bindEvents(){this._searchBtn.addEventListener("click",()=>this._search()),this._searchInput.addEventListener("keydown",t=>{t.key==="Enter"&&this._search()})}async _search(){let t=this._searchInput.value.trim();if(!t)return u.show("Enter a song or artist to search.","error");this._resultsEl.innerHTML=`
      <div class="loading-state">
        <span class="spinner" aria-hidden="true"></span> Searching iTunes\u2026
      </div>`;try{let{data:e}=await h.get("/music/search",{q:t,limit:12}),r=e.results??[];if(!r.length){this._resultsEl.innerHTML=`
          <p style="color:var(--text-muted);padding:12px 0">
            No results found for "${i(t)}".
          </p>`;return}let n=this._sectionSelect.value;this._resultsEl.innerHTML=`
        <div class="music-results" role="list" aria-label="Search results">
          ${r.map(c=>this._trackCard(c,n)).join("")}
        </div>`,this._resultsEl.querySelectorAll(".add-track-btn").forEach(c=>{c.addEventListener("click",()=>{let o=c.closest("[data-track-id]");this._addTrack({section:n,trackId:o.dataset.trackId,trackName:o.dataset.trackName,artistName:o.dataset.artistName,artworkUrl:o.dataset.artwork||void 0,previewUrl:o.dataset.preview||void 0})})})}catch{this._resultsEl.innerHTML=`
        <p style="color:var(--danger);padding:12px 0">
          Search failed. Please check your connection and try again.
        </p>`}}_trackCard(t,e){let r=t.artworkUrl60||"";return`
      <div class="music-result-card" role="listitem"
           data-track-id="${i(String(t.trackId))}"
           data-track-name="${i(t.trackName||"")}"
           data-artist-name="${i(t.artistName||"")}"
           data-artwork="${i(r)}"
           data-preview="${i(t.previewUrl||"")}">
        ${r?`<img class="music-artwork" src="${i(r)}"
                  alt="${i(t.trackName)} artwork" loading="lazy" />`:`<div class="music-artwork" style="background:var(--surface-2);display:flex;
                  align-items:center;justify-content:center;font-size:1.3rem" aria-hidden="true">\u{1F3B5}</div>`}
        <div class="music-info">
          <div class="music-title">${i(t.trackName||"Unknown")}</div>
          <div class="music-artist">${i(t.artistName||"Unknown Artist")}</div>
        </div>
        <button class="btn btn-primary add-track-btn"
                style="padding:6px 12px;font-size:.8rem;white-space:nowrap;"
                aria-label="Add ${i(t.trackName)} to ${i(e)}">
          + Add
        </button>
      </div>`}async _addTrack(t){try{await h.post("/music/tracks",t),u.show(`Added to ${t.section}!`,"success"),await this._loadPlaylists()}catch(e){if(e.status===409)return u.show(`Already in ${t.section}.`);u.show(e.message||"Could not add track.","error")}}async _removeTrack(t){try{await h.delete(`/music/tracks/${t}`),u.show("Track removed."),await this._loadPlaylists()}catch(e){u.show(e.message||"Could not remove track.","error")}}async _loadPlaylists(){try{let{data:t}=await h.get("/music");this._renderPlaylists(t.playlists,t.sections)}catch{u.show("Could not load playlists.","error")}}_renderPlaylists(t,e){let r=Object.values(t).reduce((n,c)=>n+c.length,0);this._emptyState.hidden=r>0,this._playlistEl.innerHTML=e.map(n=>{let c=t[n]??[];if(!c.length)return"";let o=n.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");return`
        <div class="playlist-section card" aria-labelledby="sec-${o}">
          <div class="playlist-section-header">
            <h3 class="card-title" id="sec-${o}" style="border:none;padding:0;margin:0;">
              \u{1F3B5} ${i(n)}
              <span style="font-size:.85rem;font-weight:400;color:var(--text-muted)">
                (${c.length} song${c.length!==1?"s":""})
              </span>
            </h3>
          </div>
          <ul class="item-list" aria-label="${i(n)} playlist">
            ${c.map(s=>`
              <li class="item-card music-result-card" data-id="${i(s.id)}" style="gap:10px">
                ${s.artwork_url?`<img class="music-artwork" src="${i(s.artwork_url)}"
                          alt="${i(s.track_name)} artwork" loading="lazy" />`:`<div class="music-artwork" style="background:var(--surface-2);
                          display:flex;align-items:center;justify-content:center;
                          font-size:1.2rem" aria-hidden="true">\u{1F3B5}</div>`}
                <div class="music-info">
                  <div class="music-title" style="font-size:.9rem">
                    ${i(s.track_name||"Unknown")}
                  </div>
                  <div class="music-artist">${i(s.artist_name||"")}</div>
                </div>
                ${s.preview_url?`<a href="${i(s.preview_url)}" target="_blank" rel="noopener noreferrer"
                        class="btn btn-ghost" style="padding:4px 10px;font-size:.78rem"
                        aria-label="Preview ${i(s.track_name)}">\u25B6 Preview</a>`:""}
                <button class="btn btn-danger remove-track-btn"
                        aria-label="Remove ${i(s.track_name)}">\u2715</button>
              </li>`).join("")}
          </ul>
        </div>`}).join(""),this._playlistEl.querySelectorAll(".remove-track-btn").forEach(n=>n.addEventListener("click",()=>this._removeTrack(n.closest("[data-id]").dataset.id)))}};document.addEventListener("DOMContentLoaded",()=>{new k().init()});
