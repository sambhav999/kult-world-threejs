'use strict';
const esbuild=require('esbuild');
const fs=require('node:fs');
const path=require('node:path');
async function main(){
  const root=path.resolve(__dirname,'..');
  const opts={bundle:true,minify:true,target:['es2020'],format:'iife',legalComments:'eof',logLevel:'info'};
  await esbuild.build({...opts,entryPoints:[path.join(root,'client/world-app.mjs')],outfile:path.join(root,'static/world3d.js')});
  const preview=await esbuild.build({...opts,entryPoints:[path.join(root,'client/preview-entry.mjs')],write:false});
  const html=fs.readFileSync(path.join(root,'client/preview-template.html'),'utf8')
    .replace('/*__WORLD_CSS__*/',()=>fs.readFileSync(path.join(root,'static/world3d.css'),'utf8'))
    .replace('/*__WORLD_JS__*/',()=>preview.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
  fs.writeFileSync(path.join(root,'KULT_World_3D_Preview.html'),html);
  fs.writeFileSync(path.join(root,'static/preview3d.js'),preview.outputFiles[0].text);
  const served=fs.readFileSync(path.join(root,'client/preview-template.html'),'utf8').replace('/*__WORLD_CSS__*/',()=>fs.readFileSync(path.join(root,'static/world3d.css'),'utf8')).replace('<script>/*__WORLD_JS__*/</script>','<script src="/preview3d.js" defer></script>');
  fs.writeFileSync(path.join(root,'static/preview.html'),served);
  fs.mkdirSync(path.join(root,'licenses'),{recursive:true});
  fs.copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(root,'licenses/three-LICENSE.txt'));
  console.log('Built the connected 3D bundle and self-contained preview.');
}
main().catch(error=>{console.error(error);process.exit(1);});
