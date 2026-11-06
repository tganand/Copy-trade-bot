async function run() {
  const url = 'https://data-api.polymarket.com/v2/activity?user=0xc53375ff94e96100f2b30a4b5775db35218d69a9&limit=500';
  const res = await fetch(url);
  const json = await res.json();
  const trades = json.data || [];
  console.log('Total activity items in v2:', trades.length);
  if (trades.length > 0) {
    const oldest = new Date(trades[trades.length - 1].timestamp * 1000);
    const newest = new Date(trades[0].timestamp * 1000);
    console.log('Oldest activity:', oldest.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    console.log('Newest activity:', newest.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  }
}
run();
