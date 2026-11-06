async function run() {
  const url = 'https://data-api.polymarket.com/v2/activity?user=0xc53375ff94e96100f2b30a4b5775db35218d69a9&limit=500';
  const res = await fetch(url);
  const json = await res.json();
  const trades = json.data || [];
  console.log('Total trades fetched from v2:', trades.length);

  const btcTrades = trades.filter(t => t.type === 'TRADE' && (t.slug || '').startsWith('btc-updown-5m-'));
  console.log('Total BTC 5m trades:', btcTrades.length);

  btcTrades.forEach((t, i) => {
    const d = new Date(t.timestamp * 1000);
    console.log(`[${i+1}] TS: ${t.timestamp} | Time: ${d.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET (${d.toUTCString()}) | Slug: ${t.slug} | Side: ${t.side} | Outcome: ${t.outcome} | Price: ${t.price} | Size: ${t.size} | Usdc: ${t.usdc_size} | Tx: ${t.transaction_hash}`);
  });
}
run();
