(function(root){
  function bindComposerKeys(form,textarea){
    textarea.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey)return;
      event.preventDefault();
      const submit=form.querySelector('button[type="submit"],button:not([type])');
      if(!textarea.value.trim()||!submit||submit.disabled)return;
      form.requestSubmit(submit);
    });
  }
  if(typeof module==='object'&&module.exports)module.exports=bindComposerKeys;
  else root.bindComposerKeys=bindComposerKeys;
})(typeof window==='undefined'?globalThis:window);
