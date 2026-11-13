// Navigation between static design states, not production overlay behaviour.
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>location.href=b.dataset.go));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){location.href=/search|settings|presets|application/.test(location.pathname)?'edit.html':'raid-1080.html'}if(e.ctrlKey&&e.key==='k'){e.preventDefault();location.href='search.html'}});
