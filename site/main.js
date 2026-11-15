// Mochi landing page. Download buttons point at the Releases page by default. When a published release exists,
// they are upgraded to direct links to its installers (draft releases are not visible here, so nothing is
// advertised before it has been published).
(function () {
  const REPO = 'KhageshVaidya/mochi-a-little-more-than-a-pet';
  const RELEASES = `https://github.com/${REPO}/releases`;
  const patterns = {
    mac: /mac-arm64.*\.dmg$/i,
    'mac-intel': /mac-x64.*\.dmg$/i,
    win: /win-x64.*\.exe$/i,
  };

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((rel) => {
      const status = document.getElementById('download-status');
      if (!rel || !Array.isArray(rel.assets)) {
        if (status) status.innerHTML = `The first release is being prepared. Watch the <a href="${RELEASES}">Releases page</a>, or build Mochi from source today.`;
        return;
      }
      const find = (re) => rel.assets.find((a) => re.test(a.name));
      document.querySelectorAll('[data-dl]').forEach((a) => {
        const asset = find(patterns[a.dataset.dl]);
        if (asset) {
          a.href = asset.browser_download_url;
          a.title = `${asset.name} · ${(asset.size / 1e6).toFixed(0)} MB`;
        } else {
          a.href = rel.html_url;
        }
      });
      if (status) {
        const unsigned = rel.assets.some((x) => /unsigned/i.test(x.name));
        status.innerHTML = `Latest: <a href="${rel.html_url}">${rel.name || rel.tag_name}</a>${unsigned ? ' · <b>unsigned</b> demonstration builds, so your system will ask you to confirm the first launch' : ''}. Checksums are listed on the release page.`;
      }
    })
    .catch(() => {});
})();
