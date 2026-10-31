export const genericProfile = Object.freeze({
  id: 'generic-royalty-csv',
  aliases: {
    artist: ['artist', 'artist name'],
    title: ['title', 'track', 'track title', 'song', 'song title'],
    store: ['store', 'service', 'platform', 'streaming service'],
    earnings: ['earnings', 'amount', 'net earnings', 'royalty', 'royalties', 'total earned'],
    quantity: ['quantity', 'streams', 'plays', 'units'],
    date: ['date', 'sale date', 'report date', 'month'],
    currency: ['currency', 'currency code', 'payment currency']
  },
  required: ['earnings']
});
