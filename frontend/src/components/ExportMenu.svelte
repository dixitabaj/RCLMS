<script>
  import { toPng, toJpeg } from 'html-to-image';
  import { jsPDF } from 'jspdf';

  export let target;           // DOM element to capture for PNG / JPG / PDF
  export let rows = [];        // records used for the XML export
  export let region = '';
  export let year = '';
  export let urlYear = '';     // existing server CSV links
  export let urlAll = '';
  export let disabled = false;

  let busy = false;
  let error = '';

  $: baseName = `landcover_${region}_${year}`.replace(/[^\w-]+/g, '_');

  const esc = (s) =>
    String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

  function save(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const imgOpts = { backgroundColor: '#ffffff', pixelRatio: 2, quality: 0.95 };

  async function exportPdf() {
    const dataUrl = await toPng(target, imgOpts);
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const pdf = new jsPDF({ orientation: img.width > img.height ? 'l' : 'p', unit: 'pt', format: 'a4' });
    const margin = 24;
    const pw = pdf.internal.pageSize.getWidth() - margin * 2;
    const ph = pdf.internal.pageSize.getHeight() - margin * 2;
    const scale = Math.min(pw / img.width, ph / img.height);
    pdf.addImage(dataUrl, 'PNG', margin, margin, img.width * scale, img.height * scale);
    pdf.save(`${baseName}.pdf`);
  }

  function exportXml() {
    const body = rows
      .map(
        (r) =>
          `  <record class="${esc(r.class_name)}">\n` +
          `    <area_ha>${r.area_ha}</area_ha>\n` +
          `    <filled_missing>${!!r.filled_missing}</filled_missing>\n` +
          `  </record>`
      )
      .join('\n');
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<landcover region="${esc(region)}" year="${esc(year)}">\n${body}\n</landcover>\n`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    save(url, `${baseName}.xml`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onChange(e) {
    const choice = e.target.value;
    e.target.value = '';                 // back to the "Export…" label
    if (!choice) return;

    error = '';
    busy = true;
    try {
      if (choice === 'csv-year') save(urlYear, `${baseName}.csv`);
      else if (choice === 'csv-all') save(urlAll, `landcover_${region}_all_years.csv`.replace(/[^\w.-]+/g, '_'));
      else if (choice === 'xml') exportXml();
      else if (!target) throw new Error('Nothing to capture yet');
      else if (choice === 'png') save(await toPng(target, imgOpts), `${baseName}.png`);
      else if (choice === 'jpg') save(await toJpeg(target, imgOpts), `${baseName}.jpg`);
      else if (choice === 'pdf') await exportPdf();
    } catch (err) {
      error = `Export failed: ${err.message}`;
    } finally {
      busy = false;
    }
  }
</script>

<div class="export">
  <select on:change={onChange} disabled={disabled || busy} aria-label="Export">
    <option value="">{busy ? 'Exporting…' : 'Export'}</option>
    <optgroup label="Document / image">
      <option value="pdf">PDF</option>
      <option value="png">PNG</option>
      <option value="jpg">JPG</option>
    </optgroup>
    <optgroup label="Data">
      <option value="xml">XML</option>
      <option value="csv-year">CSV ({year})</option>
      <option value="csv-all">CSV (all years)</option>
    </optgroup>
  </select>
  {#if error}<span class="err">{error}</span>{/if}
</div>

<style>
  .export { display: flex; align-items: center; gap: 8px; }
  select {
    background: #0a7d3b; color: #fff; border: none; border-radius: 4px;
    padding: 7px 12px; font-size: .9rem; cursor: pointer;
  }
  select:disabled { opacity: .6; cursor: default; }
  select option, select optgroup { color: #222; background: #fff; }
  .err { color: #b00020; font-size: .82rem; }
</style>