export function exportSvgFromContainer(container: HTMLDivElement): string {
  const svgEl = container.querySelector('svg')
  if (!svgEl) return ''
  // Remove transient editing attributes before serializing
  svgEl.querySelectorAll('[data-base-transform]').forEach(el => el.removeAttribute('data-base-transform'))
  return new XMLSerializer().serializeToString(svgEl)
}
