async function run() {
  let allTrades = [];
  let cursor = '';
  let page = 1;
  while (page <= 20) {
    let url = `https://data-api.polymarket.com/v2/activity?user=0xc53375ff94e96100f2b30a4b5775db35218d69a9&limit=500`;
    if (cursor) url += `&cursor=${cursor}`;
    const res = await fetch(url);
    const json = await res.json();
    const batch = json.data || [];
    if (batch.length === 0) break;
    allTrades.push(...batch);
    console.log(`Page ${page}: got ${batch.length} items. Pagination info:`, json.pagination);
    
    if (json.pagination && json.pagination.next_cursor) {
      cursor = json.pagination.next_cursor;
      if (!cursor || cursor === '0' || cursor === '') break;
    } else if (json.pagination && json.pagination.has_more === false) {
      break;
    } else {
      break;
    }
    page++;
  }

  console.log('Total activity items fetched via cursor pagination:', allTrades.length);
  const btcTrades = allTrades.filter(t => t.type === 'TRADE' && (t.slug || '').startsWith('btc-updown-5m-'));
  console.log('Total BTC 5m trades:', btcTrades.length);

  if (btcTrades.length > 0) {
    btcTrades.sort((a, b) => a.timestamp - b.timestamp);
    const oldest = new Date(btcTrades[0].timestamp * 1000);
    const newest = new Date(btcTrades[btcTrades.length - 1].timestamp * 1000);
    console.log('Oldest BTC trade:', btcTrades[0].timestamp, `(${oldest.toUTCString()} / ${oldest.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
    console.log('Newest BTC trade:', btcTrades[btcTrades.length - 1].timestamp, `(${newest.toUTCString()} / ${newest.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
    
    // Check if any trades fall between 9:20 AM and 10:20 AM ET
    const morningTrades = btcTrades.filter(t => {
      const d = new Date(t.timestamp * 1000);
      const dateStr = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
      const timeStr = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return timeStr >= '09:20:00' && timeStr <= '10:20:00';
    });
    console.log('Trades between 9:20 AM and 10:20 AM ET across all fetched history:', morningTrades.length);
  }
}
run();
