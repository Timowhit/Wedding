var b="fp_token",y="fp_user",w="fp_wedding_id",v={getActiveId(){return localStorage.getItem(w)},setActiveId(i){i?localStorage.setItem(w,i):localStorage.removeItem(w)},clear(){localStorage.removeItem(w)}},g={getToken(){return localStorage.getItem(b)},setToken(i){localStorage.setItem(b,i)},getUser(){try{return JSON.parse(localStorage.getItem(y))}catch{return null}},setUser(i){localStorage.setItem(y,JSON.stringify(i))},clearSession(){localStorage.removeItem(b),localStorage.removeItem(y),v.clear()},isLoggedIn(){return!!this.getToken()},async register({email:i,password:e,displayName:t}){let{data:n}=await _.post("/auth/register",{email:i,password:e,displayName:t});return g.setToken(n.token),g.setUser(n.user),n},async login({email:i,password:e}){let{data:t}=await _.post("/auth/login",{email:i,password:e});return g.setToken(t.token),g.setUser(t.user),t},logout(){g.clearSession(),window.location.href="/login.html"},requireAuth(){g.isLoggedIn()||(window.location.href="/login.html")}},f=class extends Error{constructor(e,t,n=[]){super(t),this.name="ApiResponseError",this.status=e,this.errors=n}},C="/api/v1",_={async request(i,{method:e="GET",body:t,query:n}={}){let a=`${C}${i}`;if(n&&Object.keys(n).length){let l=Object.fromEntries(Object.entries(n).filter(([,h])=>h!=null&&h!==""));Object.keys(l).length&&(a+="?"+new URLSearchParams(l).toString())}let d={"Content-Type":"application/json"},r=g.getToken();r&&(d.Authorization=`Bearer ${r}`);let s=v.getActiveId();s&&(d["X-Wedding-ID"]=s);let o=await fetch(a,{method:e,headers:d,body:t!==void 0?JSON.stringify(t):void 0});if(o.status===204)return{success:!0,data:null};let m=await o.json().catch(()=>({success:!1,message:`HTTP ${o.status}`,errors:[]}));if(!o.ok)throw o.status===401?(g.clearSession(),window.location.href="/login.html",new f(401,"Session expired. Please log in again.")):new f(o.status,m.message||`HTTP ${o.status}`,m.errors||[]);return m},get(i,e){return this.request(i,{method:"GET",query:e})},post(i,e){return this.request(i,{method:"POST",body:e})},put(i,e){return this.request(i,{method:"PUT",body:e})},patch(i,e){return this.request(i,{method:"PATCH",body:e})},delete(i){return this.request(i,{method:"DELETE"})}},p=_;var u=class i{static _container=null;static _getContainer(){return this._container||(this._container=document.createElement("div"),this._container.className="toast-container",this._container.setAttribute("aria-live","polite"),this._container.setAttribute("aria-atomic","true"),document.body.appendChild(this._container)),this._container}static show(e,t="default",n=2800){let a=document.createElement("div");a.className=`toast${t!=="default"?" "+t:""}`,a.textContent=e,this._getContainer().appendChild(a),setTimeout(()=>{a.style.opacity="0",a.style.transition="opacity .3s ease",setTimeout(()=>a.remove(),350)},n)}static showErrors(e=[]){e.length&&i.show(e.map(t=>t.msg).join(" \xB7 "),"error",4e3)}};function c(i){return String(i??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function S(){let i=window.location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".site-nav a").forEach(e=>{let t=e.getAttribute("href");e.classList.toggle("active",t===i||i===""&&t==="index.html")})}function I(){S();let i=document.getElementById("nav-user");if(i){let n=g.getUser();i.textContent=n?.display_name||n?.email||""}let e=document.getElementById("logout-btn");e&&e.addEventListener("click",n=>{n.preventDefault(),g.logout()});let t=document.querySelector(".site-nav");if(t&&!t.querySelector(".hamburger")){let n=t.querySelector(".brand"),a=[...t.querySelectorAll("a:not(.brand)")],d=t.querySelector(".nav-user-group");if(a.length&&n){let r=document.createElement("div");r.className="nav-links",a.forEach(o=>r.appendChild(o));let s=document.createElement("button");s.className="hamburger",s.setAttribute("aria-label","Toggle navigation menu"),s.setAttribute("aria-expanded","false"),s.innerHTML="<span></span><span></span><span></span>",n.after(s),d?(s.after(r),r.after(d)):s.after(r),s.addEventListener("click",o=>{o.stopPropagation();let m=r.classList.toggle("open");s.classList.toggle("open",m),s.setAttribute("aria-expanded",String(m))}),document.addEventListener("click",o=>{!t.contains(o.target)&&r.classList.contains("open")&&(r.classList.remove("open"),s.classList.remove("open"),s.setAttribute("aria-expanded","false"))}),r.addEventListener("click",o=>{o.target.tagName==="A"&&(r.classList.remove("open"),s.classList.remove("open"),s.setAttribute("aria-expanded","false"))})}}T()}async function T(){try{let{data:i}=await p.get("/weddings"),e=i.weddings||[];if(!e.length)return;v.getActiveId()||v.setActiveId(e[0].id),B(e)}catch{}}function B(i){let e=document.querySelector(".site-nav");if(!e||e.querySelector(".wedding-switcher"))return;let t=v.getActiveId()||i[0].id,n=document.createElement("select");n.className="wedding-switcher",n.setAttribute("aria-label","Switch wedding"),n.title="Switch wedding",i.forEach(o=>{let m=document.createElement("option");m.value=o.id,m.textContent=o.name,m.selected=o.id===t,n.appendChild(m)});let a=document.createElement("option");a.disabled=!0,a.textContent="\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",n.appendChild(a);let d=document.createElement("option");d.value="__join__",d.textContent="+ Join another\u2026",n.appendChild(d),n.addEventListener("change",()=>{let o=n.value;if(o==="__join__"){n.value=t,W();return}v.setActiveId(o),location.reload()});let r=e.querySelector(".brand"),s=e.querySelector(".hamburger");s?e.insertBefore(n,s):r.after(n)}async function W(i=null){document.getElementById("fp-invite-modal")?.remove();let e=i;if(e===null)try{let{data:s}=await p.get("/weddings/my-pending-invites");e=s.invites||[]}catch{e=[]}let t=document.createElement("div");t.id="fp-invite-modal",t.className="modal-overlay";let n=e.length>0;t.innerHTML=`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fp-modal-title">
      <div class="modal-header">
        <h2 id="fp-modal-title" class="modal-title">
          ${n?"\u{1F48C} Pending Invitations":"\u{1F48D} Join a Wedding"}
        </h2>
        <button class="modal-close" aria-label="Close">\u2715</button>
      </div>

      ${n?`
        <div class="modal-invites">
          ${e.map(s=>`
            <div class="modal-invite-card" data-token="${c(s.token)}">
              <div class="modal-invite-info">
                <strong>${c(s.wedding_name)}</strong>
                <span class="modal-invite-meta">
                  From ${c(s.invited_by_name)} \xB7 ${c(s.role)}
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
  `,document.body.appendChild(t);let a=t.querySelector("#fp-modal-input"),d=t.querySelector("#fp-modal-join-btn"),r=()=>t.remove();t.querySelector(".modal-close").addEventListener("click",r),t.querySelector("#fp-modal-dismiss").addEventListener("click",r),t.addEventListener("click",s=>{s.target===t&&r()}),t.querySelectorAll(".accept-invite-btn").forEach(s=>{s.addEventListener("click",()=>{let o=s.closest("[data-token]").dataset.token;k(o,s,t)})}),d.addEventListener("click",()=>{let s=A(a.value.trim());if(!s){x(t,"Please paste a valid invite link or UUID token.");return}k(s,d,t)}),a.addEventListener("keydown",s=>{s.key==="Enter"&&d.click()}),a.focus()}function A(i){let e=i.match(/[?&]token=([0-9a-f-]{36})/i);return e?e[1]:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i)?i:null}async function k(i,e,t){let n=e.textContent;e.disabled=!0,e.textContent="Joining\u2026";try{await p.post(`/weddings/invites/${i}/accept`);let{data:a}=await p.get("/weddings"),d=a.weddings||[],r=d.find(s=>s.role!=="owner")??d.at(-1);r&&v.setActiveId(r.id),t.remove(),u.show(`Joined "${r?.name??"wedding"}"! \u{1F389}`,"success"),setTimeout(()=>location.reload(),900)}catch(a){e.disabled=!1,e.textContent=n;let d=a.status===404?"Invite not found or has expired.":a.status===409?"You already belong to this wedding.":a.message||"Could not accept invite.";x(t,d)}}function x(i,e){let t=i.querySelector("#fp-modal-error");t.textContent=e}function L(i,e="Loading\u2026"){i.innerHTML=`
    <div class="loading-state" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>${c(e)}</span>
    </div>`}g.requireAuth();var E=class{constructor(){this._weddingNameInput=document.getElementById("wedding-name"),this._weddingDateInput=document.getElementById("wedding-date-input"),this._saveWeddingBtn=document.getElementById("save-wedding-btn"),this._viewerNotice=document.getElementById("viewer-notice"),this._membersList=document.getElementById("members-list"),this._inviteEmailInput=document.getElementById("invite-email-input"),this._inviteRoleSelect=document.getElementById("invite-role-select"),this._sendInviteBtn=document.getElementById("send-invite-btn"),this._invitesList=document.getElementById("invites-list"),this._currentWedding=null,this._currentUserRole=null}async init(){I(),this._bindEvents(),await this._load()}_bindEvents(){this._saveWeddingBtn.addEventListener("click",()=>this._saveWedding()),this._sendInviteBtn.addEventListener("click",()=>this._sendInvite());let e=document.getElementById("refresh-invites-btn");e&&e.addEventListener("click",()=>this._load());let t=document.getElementById("share-wedding-btn");t&&t.addEventListener("click",()=>this._shareWedding())}async _load(){L(this._membersList,"Loading settings\u2026");try{let{data:e}=await p.get("/weddings"),t=e.weddings||[];if(t.length===0)throw new Error("No wedding found");this._currentWedding=t[0],this._currentUserRole=this._currentWedding.role;let{data:n}=await p.get(`/weddings/${this._currentWedding.id}/members`),{data:a}=await p.get(`/weddings/${this._currentWedding.id}/invites`);this._renderWedding(),this._renderMembers(n.members),this._renderInvites(a.invites)}catch(e){u.show("Could not load settings.","error"),this._membersList.innerHTML=`<p style="color:var(--danger);padding:16px">${c(e.message)}</p>`}}_renderWedding(){this._weddingNameInput.value=this._currentWedding.name||"",this._weddingDateInput.value=this._currentWedding.wedding_date?this._currentWedding.wedding_date.substring(0,10):"";let e=this._currentUserRole==="owner";this._viewerNotice.style.display=e?"none":"block",this._saveWeddingBtn.disabled=!e,this._inviteEmailInput.disabled=!e,this._sendInviteBtn.disabled=!e;let t=document.getElementById("share-wedding-btn");t&&(t.disabled=!e)}async _shareWedding(){if(!this._currentWedding)return;let e=document.getElementById("share-wedding-btn"),t=e.innerHTML;e.disabled=!0,e.textContent="\u2026";try{let{data:n}=await p.post(`/weddings/${this._currentWedding.id}/share-link`,{role:"editor"}),a=`${window.location.origin}/invite.html?token=${n.invite.token}`;this._showShareSheet(a,this._currentWedding.name||"Our Wedding")}catch(n){u.show(n.message||"Could not generate share link.","error")}finally{e.disabled=!1,e.innerHTML=t}}_showShareSheet(e,t){document.getElementById("fp-share-modal")?.remove();let n=encodeURIComponent(e),a=`You're invited to help plan "${t}" on Forever Planner! \u{1F48D}
${e}`,d=encodeURIComponent(a),r=encodeURIComponent(`You're invited to plan "${t}" \u{1F48D}`),s=[{id:"copy",label:"Copy Link",color:"#5b9e6e",icon:`<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round">
               <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
               <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
             </svg>`,action:async l=>{await navigator.clipboard.writeText(e).catch(()=>{});let h=l.querySelector(".share-channel-label");h.textContent="Copied!",setTimeout(()=>{h.textContent="Copy Link"},2e3)}},{id:"sms",label:"Text",color:"#007AFF",icon:`<svg viewBox="0 0 24 24" fill="white">
               <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>
             </svg>`,href:`sms:?&body=${d}`},{id:"email",label:"Email",color:"#c9748f",icon:`<svg viewBox="0 0 24 24" fill="white">
               <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9
                        2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
             </svg>`,href:`mailto:?subject=${r}&body=${d}`},{id:"whatsapp",label:"WhatsApp",color:"#25D366",icon:`<svg viewBox="0 0 24 24" fill="white">
               <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15
                        -.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463
                        -2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606
                        .134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025
                        -.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008
                        -.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479
                        0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306
                        1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719
                        2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347
                        m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982
                        .998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884
                        9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994
                        c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0
                        0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588
                        5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005
                        c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
             </svg>`,href:`https://wa.me/?text=${d}`},{id:"x",label:"X",color:"#1c1c1e",icon:`<svg viewBox="0 0 24 24" fill="white">
               <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231
                        -5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161
                        17.52h1.833L7.084 4.126H5.117z"/>
             </svg>`,href:`https://x.com/intent/post?text=${d}`},{id:"messenger",label:"Messenger",color:"#0084FF",icon:`<svg viewBox="0 0 24 24" fill="white">
               <path d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472
                        8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0
                        12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.193 14.963l-3.056
                        -3.259-5.963 3.259L10.096 9l3.136 3.259L19.04 9l-5.847 5.963z"/>
             </svg>`,action:async()=>{window.location.href=`fb-messenger://share/?link=${n}`,await new Promise(l=>setTimeout(l,600)),await navigator.clipboard.writeText(e).catch(()=>{}),window.open("https://messenger.com","_blank","noopener"),u.show("Link copied \u2014 paste it in Messenger","default",3500)}},{id:"instagram",label:"Instagram",color:"#C13584",icon:`<svg viewBox="0 0 24 24" fill="white">
               <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691
                        4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584
                        -.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644
                        .07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699
                        -4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07
                        -4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069
                        4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78
                        2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014
                        3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689
                        .072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782
                        -2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014
                        -3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059
                        -1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162
                        6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403
                        -2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4
                        0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406
                        -11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44
                        c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
             </svg>`,action:async()=>{await navigator.clipboard.writeText(e).catch(()=>{}),window.open("https://www.instagram.com","_blank","noopener"),u.show("Link copied \u2014 paste it in Instagram","default",3500)}}],o=document.createElement("div");o.id="fp-share-modal",o.className="share-overlay",o.innerHTML=`
    <div class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title">
      <div class="share-header">
        <h2 class="share-title" id="share-sheet-title">Share Wedding Invite \u{1F48D}</h2>
        <button class="modal-close" aria-label="Close">\u2715</button>
      </div>

      <p class="share-wedding-name">${c(t)}</p>

      <div class="share-link-row">
        <span class="share-link-url" title="${c(e)}">${c(e)}</span>
        <button class="btn btn-secondary share-copy-main-btn"
                style="padding:6px 16px;font-size:.8rem;white-space:nowrap;flex-shrink:0;">
          Copy
        </button>
      </div>

      <p class="share-via">Share via</p>

      <div class="share-grid">
        ${s.map(l=>`
          <button class="share-channel" data-channel="${l.id}" title="${l.label}">
            <span class="share-channel-icon" style="background:${l.color}">
              ${l.icon}
            </span>
            <span class="share-channel-label">${l.label}</span>
          </button>
        `).join("")}
      </div>

      <button class="btn btn-ghost btn-full share-dismiss-btn"
              style="font-size:.85rem;margin-top:4px;">
        Done
      </button>
    </div>
  `,document.body.appendChild(o);let m=()=>o.remove();o.querySelector(".modal-close").addEventListener("click",m),o.querySelector(".share-dismiss-btn").addEventListener("click",m),o.addEventListener("click",l=>{l.target===o&&m()}),o.querySelector(".share-copy-main-btn").addEventListener("click",async l=>{await navigator.clipboard.writeText(e).catch(()=>{});let h=l.currentTarget;h.textContent="\u2713 Copied",setTimeout(()=>{h.textContent="Copy"},2e3)}),o.querySelectorAll(".share-channel").forEach(l=>{let h=s.find($=>$.id===l.dataset.channel);h&&l.addEventListener("click",()=>{h.action?h.action(l):h.href&&window.open(h.href,"_blank","noopener,noreferrer")})})}async _saveWedding(){let e=this._weddingNameInput.value.trim(),t=this._weddingDateInput.value||null;try{await p.patch(`/weddings/${this._currentWedding.id}`,{name:e,weddingDate:t}),this._currentWedding.name=e,this._currentWedding.wedding_date=t,u.show("Wedding updated!","success")}catch(n){u.show(n.message||"Could not update wedding.","error")}}_renderMembers(e){if(this._membersList.innerHTML="",!e||e.length===0){this._membersList.innerHTML='<p style="color:var(--text-muted);padding:12px">No members yet.</p>';return}e.forEach(n=>{let a=document.createElement("div");a.className="member-card";let d=n.id===g.getUser()?.id,r=this._currentUserRole==="owner"&&!d,s=(n.display_name||n.email||"?")[0].toUpperCase();a.innerHTML=`
        <div class="member-avatar">${n.avatar_url?`<img src="${c(n.avatar_url)}" alt="" />`:c(s)}</div>
        <div class="member-info">
          <div class="member-name">
            ${c(n.display_name||n.email)}
            ${d?'<span class="you-badge">you</span>':""}
          </div>
          <div class="member-email">${c(n.email)}</div>
        </div>
        <div class="member-role">
          ${r?`<select class="role-select" data-user-id="${c(n.id)}">
                  <option value="viewer"  ${n.role==="viewer"?"selected":""}>Viewer</option>
                  <option value="editor"  ${n.role==="editor"?"selected":""}>Editor</option>
                  <option value="owner"   ${n.role==="owner"?"selected":""}>Owner</option>
                </select>`:`<span class="owner-badge">${c(n.role)}</span>`}
        </div>
        ${r?`<button class="btn btn-danger remove-member-btn" data-user-id="${c(n.id)}">Remove</button>`:""}
      `,r&&(a.querySelector(".role-select").addEventListener("change",o=>this._changeRole(n.id,o.target.value)),a.querySelector(".remove-member-btn").addEventListener("click",()=>this._removeMember(n.id))),this._membersList.appendChild(a)});let t=document.getElementById("member-count");t&&(t.textContent=`${e.length} member${e.length!==1?"s":""}`)}async _changeRole(e,t){try{await p.patch(`/weddings/${this._currentWedding.id}/members/${e}`,{role:t}),u.show("Role updated!","success"),await this._load()}catch(n){u.show(n.message||"Could not update role.","error")}}async _removeMember(e){if(confirm("Remove this member from the wedding?"))try{await p.delete(`/weddings/${this._currentWedding.id}/members/${e}`),u.show("Member removed.","success"),await this._load()}catch(t){u.show(t.message||"Could not remove member.","error")}}async _sendInvite(){let e=this._inviteEmailInput.value.trim(),t=this._inviteRoleSelect.value;if(!e)return u.show("Please enter an email address.","error");this._sendInviteBtn.disabled=!0,document.getElementById("invite-link-container").style.display="none";try{let{data:n}=await p.post(`/weddings/${this._currentWedding.id}/members`,{email:e,role:t});if(this._inviteEmailInput.value="",n.invite){let a=`${window.location.origin}/invite.html?token=${n.invite.token}`,d=document.getElementById("invite-link-container"),r=document.getElementById("invite-link-text"),s=document.getElementById("copy-link-btn");r.textContent=a,d.style.display="block",s.onclick=()=>{navigator.clipboard.writeText(a).then(()=>{s.textContent="Copied!",setTimeout(()=>s.textContent="Copy",2e3)})},u.show("Invite created! Copy the link below.","success")}else u.show("Member added directly!","success");await this._load()}catch(n){u.show(n.message||"Could not send invite.","error")}finally{this._sendInviteBtn.disabled=!1}}_renderInvites(e){if(this._invitesList.innerHTML="",!e||e.length===0){this._invitesList.innerHTML='<p style="color:var(--text-muted);padding:12px">No pending invites.</p>';return}e.forEach(t=>{let n=document.createElement("div");n.className="invite-item";let a=new Date(t.expires_at)<new Date,d=!!t.accepted_at,r=d?"Accepted":a?"Expired":"Pending",s=d?"invite-used":"";n.innerHTML=`
        <div style="flex:1">
          <div class="invite-email">${c(t.invited_email)}</div>
          <div class="invite-status ${s}">${r} \xB7 ${c(t.role)}</div>
        </div>
        ${this._currentUserRole==="owner"?`<button class="btn btn-danger delete-invite-btn" data-invite-id="${c(t.id)}">Delete</button>`:""}
      `,this._currentUserRole==="owner"&&n.querySelector(".delete-invite-btn").addEventListener("click",()=>this._deleteInvite(t.id)),this._invitesList.appendChild(n)})}async _deleteInvite(e){try{await p.delete(`/weddings/${this._currentWedding.id}/invites/${e}`),u.show("Invite deleted.","success"),await this._load()}catch(t){u.show(t.message||"Could not delete invite.","error")}}};document.addEventListener("DOMContentLoaded",()=>new E().init());
