import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('digest UI stays opt-in and viewing does not schedule AI',async()=>{
 const main=await readFile(new URL('./main.js',import.meta.url),'utf8'),nav=await readFile(new URL('./navigation.js',import.meta.url),'utf8');
 assert.match(main,/VITE_MEDIA_WATCH_DAILY_DIGEST_ENABLED === 'true' \? initMediaEmailPreference/);
 assert.doesNotMatch(nav,/scheduleWatchTranslations|translateStoredWatchCopy/);
 assert.match(nav,/getLocalizedWatchCopy/);
});
