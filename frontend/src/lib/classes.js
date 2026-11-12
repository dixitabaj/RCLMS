// Colours sampled from the legend of the original ICIMOD RLCMS app.
export const CLASS_COLORS = {
  'Forest': '#267300',
  'Grassland': '#b4ff9a',
  'Cropland': '#ffff00',
  'Bare soil': '#d7c29e',
  'Bare rock': '#e8beff',
  'Built-up': '#ff0000',
  'Snow and glacier': '#73dfff',
  'Water body': '#0044ff',
  'Riverbed': '#2b88ff',
};

export const colorFor = (name) => CLASS_COLORS[name] ?? '#999999';

export const REGION_TYPE_NOUN = {
  hkh: 'region',
  ecoregion: 'ecoregion',
  hotspot: 'biodiversity hotspot',
};
