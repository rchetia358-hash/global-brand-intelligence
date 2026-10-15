'use strict';
// Idempotent patch for src/data/brands.json.
// Run: node scripts/add-hotspot-brands.js
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'src', 'data', 'brands.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const fashion = data.industries.find(i => i.id === 'fashion-luxury');

const NEW_BRANDS = [
  { id: 'uniqlo', name: 'Uniqlo', parent: 'Fast Retailing', country: 'Japan', ticker: '9983.T',
    website: 'https://www.uniqlo.com', searchTerms: ['Uniqlo', 'Fast Retailing'] },
  { id: 'mango', name: 'Mango', parent: 'Punto Fa, S.L.', country: 'Spain', ticker: null,
    website: 'https://shop.mango.com', searchTerms: ['Mango fashion', 'Mango clothing', 'Mango retailer', 'Mango stores'] },
  { id: 'cos', name: 'COS', parent: 'H&M Group', country: 'Sweden', ticker: null,
    website: 'https://www.cos.com', searchTerms: ['COS fashion', 'COS clothing', 'COS stores', 'COS collection'] },
  { id: 'pull-and-bear', name: 'Pull&Bear', parent: 'Inditex', country: 'Spain', ticker: null,
    website: 'https://www.pullandbear.com', searchTerms: ['Pull&Bear', 'Pull & Bear'] },
  { id: 'bershka', name: 'Bershka', parent: 'Inditex', country: 'Spain', ticker: null,
    website: 'https://www.bershka.com', searchTerms: ['Bershka'] },
  { id: 'massimo-dutti', name: 'Massimo Dutti', parent: 'Inditex', country: 'Spain', ticker: null,
    website: 'https://www.massimodutti.com', searchTerms: ['Massimo Dutti'] },
  { id: 'stradivarius', name: 'Stradivarius', parent: 'Inditex', country: 'Spain', ticker: null,
    website: 'https://www.stradivarius.com', searchTerms: ['Stradivarius fashion', 'Stradivarius stores', 'Stradivarius Inditex'] },
  { id: 'the-north-face', name: 'The North Face', parent: 'VF Corporation', country: 'United States', ticker: 'VFC',
    website: 'https://www.thenorthface.com', searchTerms: ['The North Face', 'VF Corporation'] }
];

// Optional per-brand config used by the "brand news" feature (all fields optional):
//  newsTerms       strict terms an article must contain (defaults to name + searchTerms)
//  newsQuery       query used against the news search feed (defaults to quoted name)
//  caseSensitive   match newsTerms case-sensitively (for short names like COS)
//  officialDomains publisher domains treated as the brand's own newsroom
//  officialFeeds   [{ name, url }] official RSS/Atom feeds to read directly
const NEWS_CONFIG = {
  hm:              { newsTerms: ['H&M', 'H&M Group', 'Hennes & Mauritz'], newsQuery: '"H&M" OR "H&M Group"', officialDomains: ['hmgroup.com', 'about.hm.com', 'hm.com'] },
  zara:            { newsTerms: ['Zara', 'Inditex'], newsQuery: 'Zara OR Inditex', newsExclude: ['Zara Larsson', 'Zara Tindall', 'Zara Phillips', 'Zara McDermott', 'Zara Rutherford', 'Zara Holland', 'Zara Dar', 'Zara Hussain', 'Zara Anne'], officialDomains: ['inditex.com', 'zara.com'] },
  nike:            { newsTerms: ['Nike'], newsQuery: '"Nike"', officialDomains: ['nike.com', 'news.nike.com'] },
  adidas:          { newsTerms: ['Adidas'], newsQuery: '"adidas"', officialDomains: ['adidas-group.com', 'adidas.com'] },
  uniqlo:          { newsTerms: ['Uniqlo', 'Fast Retailing'], newsQuery: 'Uniqlo OR "Fast Retailing"', officialDomains: ['fastretailing.com', 'uniqlo.com'] },
  mango:           { newsTerms: ['Mango'], newsQuery: '"Mango" (fashion OR clothing OR retailer OR stores)', officialDomains: ['mango.com', 'shop.mango.com'] },
  cos:             { newsTerms: ['COS'], caseSensitive: true, newsQuery: '"COS" (fashion OR clothing OR "H&M Group" OR collection)', officialDomains: ['cos.com', 'hmgroup.com'] },
  'pull-and-bear': { newsTerms: ['Pull&Bear', 'Pull & Bear'], newsQuery: '"Pull&Bear"', officialDomains: ['pullandbear.com', 'inditex.com'] },
  bershka:         { newsTerms: ['Bershka'], newsQuery: '"Bershka"', officialDomains: ['bershka.com', 'inditex.com'] },
  'massimo-dutti': { newsTerms: ['Massimo Dutti'], newsQuery: '"Massimo Dutti"', officialDomains: ['massimodutti.com', 'inditex.com'] },
  stradivarius:    { newsTerms: ['Stradivarius'], newsQuery: '"Stradivarius" (fashion OR retailer OR Inditex OR stores)', officialDomains: ['stradivarius.com', 'inditex.com'] },
  'the-north-face':{ newsTerms: ['The North Face'], newsQuery: '"The North Face"', officialDomains: ['thenorthface.com', 'vfc.com'] }
};

const all = () => data.industries.flatMap(i => i.brands);
for (const b of NEW_BRANDS) {
  if (!all().some(x => x.id === b.id)) { fashion.brands.push(b); console.log('added', b.id); }
}
for (const [id, cfg] of Object.entries(NEWS_CONFIG)) {
  const brand = all().find(x => x.id === id);
  if (brand) Object.assign(brand, cfg); else console.warn('missing brand', id);
}
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log('brands.json updated');
