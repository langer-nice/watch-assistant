import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { CURRENCY_SOURCE, parseCurrencyRequest, evaluateCurrencyRate, validateObservation } from '../src/js/currency-watch.js';

const failure = (code) => Object.assign(new Error(code), { code, statusCode: 502 });
export const fetchCurrencyRate = async (request, { fetchImpl = fetch, now = () => new Date(), timeoutMs = 8000 } = {}) => {
  const criteria = parseCurrencyRequest(request);
  if (!criteria) throw Object.assign(failure('INVALID_CURRENCY_CRITERIA'), { statusCode: 400 });
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(failure('TIMEOUT')); }, timeoutMs); });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl(CURRENCY_SOURCE.url, { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { Accept: 'application/xml,text/xml' } });
      if (!response.ok) throw failure('CURRENCY_PROVIDER_UNAVAILABLE');
      if (Number(response.headers?.get('content-length')) > 65536) throw failure('INVALID_CURRENCY_DATA');
      // Bound the stream as well as Content-Length, including chunked responses.
      let xml = '';
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let size = 0;
        try { while (true) { const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength; if (size > 65536) { await reader.cancel(); throw failure('INVALID_CURRENCY_DATA'); }
          xml += decoder.decode(value, { stream: true });
        } xml += decoder.decode(); } finally { reader.releaseLock(); }
      } else xml = await response.text();
      if (xml.length > 65536 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw failure('INVALID_CURRENCY_DATA');
      const parsed = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, removeNSPrefix: true }).parse(xml);
      const cube = parsed?.Envelope?.Cube?.Cube;
      const rates = Array.isArray(cube?.Cube) ? cube.Cube : [cube?.Cube];
      const pounds = rates.filter(row => row?.['@_currency'] === 'GBP');
      if (pounds.length !== 1) throw failure('INVALID_CURRENCY_DATA');
      const checked = now();
      const observation = validateObservation({ base: 'EUR', quote: 'GBP', rate: pounds[0]['@_rate'], date: cube['@_time'] }, checked);
      evaluateCurrencyRate(criteria, observation);
      return { criteria, observation, checkedAt: checked.toISOString(), source: CURRENCY_SOURCE };
    })()]);
  } catch (error) {
    if (error.statusCode) throw error;
    throw failure(['INVALID_CURRENCY_DATA', 'STALE_CURRENCY_DATA'].includes(error.code || error.message) ? error.code || error.message : 'CURRENCY_PROVIDER_UNAVAILABLE');
  } finally { clearTimeout(timer); }
};
