'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{safeArchiveUrl,displayArchiveUrl,getArchiveSourceLinks}=require('../services/archive-source-links');
test('confirmed archive alias relocates display while retaining stored identity and values',()=>{
 const c={migrationSource:'wordpress:news:wpml:1',legacy:{source:'https://cmcen-rcmce.ca',sourcePostIds:[22404],sourceRecords:[{sourceId:22404,language:'en',url:'https://cmcen-rcmce.ca/memo-from-director-rccs/'}]}};
 const before=JSON.stringify(c);assert.deepEqual(getArchiveSourceLinks(c),[{url:'https://archive.cmcen-rcmce.ca/memo-from-director-rccs/',language:'en'}]);assert.equal(JSON.stringify(c),before);
});
test('exact positive numeric ID route retains language only for matching source identity',()=>{
 const c={legacy:{sourcePostIds:[353103,353105],sourceRecords:[{sourceId:353103,language:'en',url:'https://cmcen-rcmce.ca/?p=353103'},{sourceId:353105,language:'fr',url:'https://cmcen-rcmce.ca/?p=353105'}]}};
 assert.deepEqual(getArchiveSourceLinks(c),[{url:'https://archive.cmcen-rcmce.ca/?p=353103',language:'en'},{url:'https://archive.cmcen-rcmce.ca/?p=353105',language:'fr'}]);
 c.legacy.sourceRecords[0].url='https://cmcen-rcmce.ca/?p=999';assert.equal(getArchiveSourceLinks(c).length,1);
});
test('unbound, duplicate, extra, fragment, zero, padded and nonnumeric root routes stay rejected',()=>{
 for(const value of ['https://cmcen-rcmce.ca/','https://cmcen-rcmce.ca/?p=0','https://cmcen-rcmce.ca/?p=0002','https://cmcen-rcmce.ca/?p=x','https://cmcen-rcmce.ca/?p=2&p=3','https://cmcen-rcmce.ca/?p=2&x=1','https://cmcen-rcmce.ca/?p=2#comment'])assert.equal(safeArchiveUrl(value),'');
 assert.deepEqual(getArchiveSourceLinks({legacy:{sourceUrl:'https://cmcen-rcmce.ca/?p=2'}}),[]);
 assert.equal(safeArchiveUrl('https://cmcen-rcmce.ca/?p=2',3),'');
});
test('credentials, foreign/lookalike hosts, ports and active schemes remain rejected',()=>{
 for(const value of ['https://user:pass@archive.cmcen-rcmce.ca/page/','https://archive.cmcen-rcmce.ca:8443/page/','https://archive.cmcen-rcmce.ca.attacker.test/page/','https://other.test/page/','javascript:alert(1)','data:text/html,bad','//archive.cmcen-rcmce.ca/page/'])assert.equal(safeArchiveUrl(value),'');
});
test('language collision remains unlabeled after alias deduplication; no authored body rewrite',()=>{
 const c={content:{en:'authored https://cmcen-rcmce.ca/original/'},legacy:{sourcePostIds:[7],sourceRecords:[{sourceId:7,language:'en',url:'http://www.cmcen-rcmce.ca/same/'},{sourceId:7,language:'fr',url:'https://archive.cmcen-rcmce.ca/same/'}]}};
 const before=JSON.stringify(c);assert.deepEqual(getArchiveSourceLinks(c),[{url:'https://archive.cmcen-rcmce.ca/same/',language:''}]);assert.equal(JSON.stringify(c),before);assert.equal(displayArchiveUrl('http://www.cmcen-rcmce.ca/page/'),'https://archive.cmcen-rcmce.ca/page/');
});
test('double-slash and encoded paths never change the pinned display authority',()=>{
 for(const path of ['//other.test/path/','///other.test/path/','/%2f%2fother.test/path/']){
  const result=displayArchiveUrl('https://cmcen-rcmce.ca'+path);
  assert.equal(new URL(result).origin,'https://archive.cmcen-rcmce.ca');
 }
 for(const value of ['https://cmcen-rcmce.ca/line\nbreak/','https://cmcen-rcmce.ca/back\\slash/','https://cmcen-rcmce.ca/raw space/'])assert.equal(safeArchiveUrl(value),'');
});
