async function run() {
  let allTrades = [];
  let cursor = '';
  let page = 1;
  console.log('Fetching deep history to cover morning & evening windows...');
  while (page <= 30) {
    let url = `https://data-api.polymarket.com/v2/activity?user=0xc53375ff94e96100f2b30a4b5775db35218d69a9&limit=500`;
    if (cursor) url += `&cursor=${cursor}`;
    const res = await fetch(url);
    const json = await res.json();
    const batch = json.data || [];
    if (batch.length === 0) break;
    allTrades.push(...batch);
    
    if (json.pagination && json.pagination.next_cursor) {
      cursor = json.pagination.next_cursor;
      if (!cursor) break;
    } else {
      break;
    }
    page++;
  }

  const btcTrades = allTrades.filter(t => t.type === 'TRADE' && (t.slug || '').startsWith('btc-updown-5m-'));
  btcTrades.sort((a, b) => a.timestamp - b.timestamp);

  if (btcTrades.length > 0) {
    const oldest = new Date(btcTrades[0].timestamp * 1000);
    const newest = new Date(btcTrades[btcTrades.length - 1].timestamp * 1000);
    console.log(`Deep fetch complete: ${btcTrades.length} BTC trades.`);
    console.log(`Earliest: ${oldest.toUTCString()} (${oldest.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
    console.log(`Latest: ${newest.toUTCString()} (${newest.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`);
  }

  // Filter for 9:20 AM to 10:20 AM ET (or 9:20 PM to 10:20 PM ET)
  // Let's check both AM and PM for 9:20 to 10:20
  const targetTrades = btcTrades.filter(t => {
    const d = new Date(t.timestamp * 1000);
    const timeStr = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const hour = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true });
    // 9:20 AM - 10:20 AM is timeStr >= '09:20:00' && timeStr <= '10:20:00'
    // 9:20 PM - 10:20 PM is timeStr >= '21:20:00' && timeStr <= '22:20:00'
    return (timeStr >= '09:20:00' && timeStr <= '10:20:00') || (timeStr >= '21:20:00' && timeStr <= '22:20:00');
  });

  console.log(`\nFound ${targetTrades.length} trades in 9:20-10:20 (AM or PM) ET range.`);

  // Group by slug
  const windows = {};
  targetTrades.forEach(t => {
    const slug = t.slug;
    if (!windows[slug]) windows[slug] = [];
    windows[slug].push(t);
  });

  for (const [slug, wTrades] of Object.entries(windows)) {
    console.log(`\n========================================`);
    console.log(`Window Slug: ${slug} (${wTrades.length} trades)`);
    console.log(`========================================`);
    wTrades.sort((a, b) => a.timestamp - b.timestamp);

    const upTrades = wTrades.filter(t => t.outcome === 'Up');
    const downTrades = wTrades.filter(t => t.outcome === 'Down');

    let totalUpShares = 0;
    let totalUpUsdc = 0;
    let totalDownShares = 0;
    let totalDownUsdc = 0;

    console.log('\n**UP trades**');
    if (upTrades.length === 0) {
      console.log('  (None)');
    } else {
      upTrades.forEach(t => {
        const d = new Date(t.timestamp * 1000);
        totalUpShares += Number(t.size);
        totalUpUsdc += Number(t.usdc_size);
        console.log(`  - Side: ${t.side} | Price: $${t.price} | Shares: ${t.size} | USDC: $${t.usdc_size} | Tx: ${t.transaction_hash} | Time: ${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);
      });
    }

    console.log('\n**DOWN trades**');
    if (downTrades.length === 0) {
      console.log('  (None)');
    } else {
      downTrades.forEach(t => {
        const d = new Date(t.timestamp * 1000);
        totalDownShares += Number(t.size);
        totalDownUsdc += Number(t.usdc_size);
        console.log(`  - Side: ${t.side} | Price: $${t.price} | Shares: ${t.size} | USDC: $${t.usdc_size} | Tx: ${t.transaction_hash} | Time: ${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);
      });
    }

    const avgUpPrice = totalUpShares > 0 ? (totalUpUsdc / totalUpShares).toFixed(4) : 'N/A';
    const avgDownPrice = totalDownShares > 0 ? (totalDownUsdc / totalDownShares).toFixed(4) : 'N/A';

    console.log(`\nSummary for Window ${slug}:`);
    console.log(`- Total UP Shares: ${totalUpShares.toFixed(4)} (Avg Price: $${avgUpPrice})`);
    console.log(`- Total DOWN Shares: ${totalDownShares.toFixed(4)} (Avg Price: $${avgDownPrice})`);
    console.log(`- Trader bought: ${upTrades.length > 0 && downTrades.length > 0 ? 'BOTH sides' : (upTrades.length > 0 ? 'ONLY UP side' : 'ONLY DOWN side')}`);
  }
}
run();
