// Only managed storage keys or this installation's legacy public URLs; never arbitrary external media.
export function villageMediaPath(value:string,origin:string):string|null {
 let key=value
 if(value.startsWith('http')){try{const url=new URL(value),base=new URL(origin),prefix='/storage/v1/object/public/village-audio/';if(url.origin!==base.origin||!url.pathname.startsWith(prefix)||url.search||url.hash)return null;key=decodeURIComponent(url.pathname.slice(prefix.length))}catch{return null}}
 return /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[A-Za-z0-9._-]+$/i.test(key)?key:null
}
