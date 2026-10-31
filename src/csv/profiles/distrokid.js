// Header fingerprints are based on publicly documented DistroKid Bank exports.
// Match a distinctive Earnings (USD) column plus sale month and store to avoid
// incorrectly classifying generic CSV files as DistroKid exports.
const norm = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
export function detectDistroKidProfile(headers) {
  const names = new Set(headers.map(norm));
  if (!['earnings (usd)', 'sale month', 'store', 'artist', 'title', 'quantity'].every(name => names.has(name))) return null;
  return {
    id: 'distrokid-bank-usd',
    aliases: {
      artist: ['artist'], title: ['title'], store: ['store'],
      earnings: ['earnings (usd)'], quantity: ['quantity'],
      date: ['sale month'], currency: [],
      isrc: ['isrc'], upc: ['upc'], territory: ['country of sale'],
      saleMonth: ['sale month'], reportingDate: ['reporting date', 'reporting month'],
      dateInserted: ['date inserted'],
      songwriterRoyaltiesWithheldUsd: ['songwriter royalties withheld (usd)'],
      recoupUsd: ['recoup (usd)'],
      sourceType: ['source type', 'song/album'],
      teamPercentage: ['team percentage']
    },
    required: ['earnings', 'saleMonth', 'store', 'artist', 'title'],
    impliedCurrency: 'USD'
  };
}
