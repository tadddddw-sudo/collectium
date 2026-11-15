<script>
  /**
   * The Collectium "C", drawn from src/lib/assets/collectium-logo.webp.
   *
   * The source file is a 1024 × 1024 canvas, but the artwork inside it sits
   * 28 px left of the canvas centre. Instead of re-encoding the file, the mark
   * shows a square window cut out of it, centred on the artwork's optical
   * centre (its alpha-weighted centroid, measured at x 484, y 511). The window
   * is 520 px wide: the artwork is 510 px tall, so that leaves 5 px of
   * breathing room above and below.
   *
   * The result is a `size` × `size` square with the C optically centred in it,
   * so parents can centre the box with ordinary flex/grid rules.
   */
  import logoUrl from '$lib/assets/collectium-logo.webp';

  export let size = 44;
  export let title = 'Collectium';

  const SOURCE = 1024;
  const WINDOW = 520;
  const CENTRE_X = 484;
  const CENTRE_Y = 511;

  const scale = `${(SOURCE / WINDOW) * 100}%`;
  const left = `${(-(CENTRE_X - WINDOW / 2) / WINDOW) * 100}%`;
  const top = `${(-(CENTRE_Y - WINDOW / 2) / WINDOW) * 100}%`;
</script>

<span class="mark" style={`--size: ${size}px`} role="img" aria-label={title}>
  <img
    src={logoUrl}
    alt=""
    draggable="false"
    style={`width: ${scale}; height: ${scale}; left: ${left}; top: ${top};`}
  />
</span>

<style>
  .mark {
    position: relative;
    display: block;
    width: var(--size);
    height: var(--size);
    flex: none;
    overflow: hidden;
  }

  img {
    position: absolute;
    max-width: none;
    user-select: none;
    pointer-events: none;
  }
</style>
