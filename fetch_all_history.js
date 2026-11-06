async function run() {
  let allTrades = [];
  let cursor = '';
  let page = 1;
  while (page <= 10) {
    let url = `https://data-api.polymarket.com/v2/activity?user=0xc53375ff94e96100f2b30a4b5775db35218d69a9&limit=500`;
    if (cursor) url += `&cursor=${cursor}`;
    const res = await fetch(url);
    const json = await res.json();
    const batch = json.data || [];
    if (batch.length === 0) break;
    allTrades.push(...batch);
    console.log(`Page ${page}: got ${batch.length} items. Total so far: ${allTrades.length}`);
    
    if (json.pagination && json.pagination.next_cursor) {
      cursor = json.pagination.next_cursor;
      if (!cursor) break;
    } else {
      break;
    }
    page++;
  }

  console.log(`Total fetched: ${allTrades.length}`);
  const btcTrades = allTrades.filter(t => t.type === 'TRADE' && (t.slug || '').startsWith('btc-updown-5m-'));
  console.log(`Total BTC 5-minute trades: ${btcTrades.length}`);

  btcTrades.sort((a, b) => a.timestamp - b.timestamp);
  if (btcTrades.length > 0) {
    const oldest = new Date(btcTrades[0].timestamp * 1000);
    const newest = new Date(btcTrades[btcTrades.length - 1].timestamp * 1000);
    console.log(`Oldest: ${oldest.toUTCString()} (${oldest.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
    console.log(`Newest: ${newest.toUTCString()} (${newest.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);

    // Let's check all unique dates and hours in btcTrades
    const hoursMap = {};
    btcTrades.forEach(t => {
      const d = new Date(t.timestamp * 1000);
      const key = `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York' })} ${d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true })}`;
      hoursMap[key] = (hoursMap[key] || 0) + 1;
    });
    console.log('Available hours (ET):', hoursMap);
  }
}
run();
