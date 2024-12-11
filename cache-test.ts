import { db } from './cachedModel';

await db.put('test', 'value');
console.log('Read', await db.get('test'));

console.log('Done');