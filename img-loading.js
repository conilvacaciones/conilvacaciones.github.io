/* Indicador de carga para imágenes: mientras una foto se descarga, su contenedor
   muestra un brillo animado (skeleton) y, al cargar, la foto aparece con un
   fundido suave. Funciona también con imágenes que se crean después (casas,
   blog, galerías...) y con las que cambian de src. */
(function(){
  var css = ".img-loading-rel{position:relative;}.img-loading{background:linear-gradient(100deg,#ECEDE6 30%,#F7F8F3 50%,#ECEDE6 70%) !important;background-size:200% 100% !important;animation:imgShimmer 1.3s linear infinite;}" +
    ".img-loading::after{content:\"\";position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid rgba(11,61,92,.15);border-top-color:#0B3D5C;animation:imgSpin .8s linear infinite;pointer-events:none;z-index:2;}" +
    "img.img-in{animation:imgIn .45s ease;}@keyframes imgIn{from{opacity:0}}" +
    "@keyframes imgShimmer{from{background-position:200% 0}to{background-position:-200% 0}}" +
    "@keyframes imgSpin{to{transform:rotate(360deg)}}" +
    "@media (prefers-reduced-motion:reduce){.img-loading,.img-loading::after{animation:none}}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  function done(img){
    img.classList.add("img-in");
    var p = img.parentElement;
    if(p) p.classList.remove("img-loading","img-loading-rel");
  }
  function arm(img){
    if(img.__imgArmed === img.currentSrc + "|" + img.getAttribute("src")) return;
    if(img.hasAttribute("data-no-loader")) return;
    if(!img.getAttribute("src")) return;
    img.__imgArmed = img.currentSrc + "|" + img.getAttribute("src");
    if(img.complete && img.naturalWidth > 0) return;
    img.classList.remove("img-in");
    var p = img.parentElement;
    if(p){
      if(getComputedStyle(p).position === "static") p.classList.add("img-loading-rel");
      p.classList.add("img-loading");
    }
    img.addEventListener("load", function(){ done(img); }, { once: true });
    img.addEventListener("error", function(){ done(img); }, { once: true });
  }
  function scan(root){
    if(root.nodeType !== 1) return;
    if(root.tagName === "IMG") arm(root);
    var imgs = root.querySelectorAll ? root.querySelectorAll("img") : [];
    for(var i=0;i<imgs.length;i++) arm(imgs[i]);
  }
  function start(){
    scan(document.body);
    new MutationObserver(function(muts){
      muts.forEach(function(m){
        if(m.type === "attributes"){ if(m.target.tagName === "IMG") arm(m.target); }
        else m.addedNodes.forEach(scan);
      });
    }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["src"] });
  }
  if(document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
