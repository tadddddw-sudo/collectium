<script>
  /**
   * The isometric "C" from the Figma file, rebuilt from five rounded plastic
   * bars. Pure CSS — no image asset, no SVG.
   *
   * Coordinates are the Figma logo's own geometry, normalised to the artwork's
   * bounding box (189 × 262 inside the 512 frame).
   */
  export let size = 44;
  export let title = 'Collectium';
</script>

<span class="mark" style={`--size: ${size}px`} role="img" aria-label={title}>
  <span class="bar b1"></span>
  <span class="bar b2"></span>
  <span class="bar b3"></span>
  <span class="bar b4"></span>
  <span class="bar b5"></span>
</span>

<style>
  .mark {
    position: relative;
    display: block;
    width: calc(var(--size) * 0.733);
    height: var(--size);
    flex: none;
  }

  /* each bar is the Figma 83 × 116 block, placed by its centre */
  .bar {
    position: absolute;
    width: 43.9%;
    height: 45%;
    border-radius: 10%;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      0 1px 2px rgba(0, 0, 0, 0.4);
  }

  /* top horizontal — the brightest face */
  .b1 {
    left: 69.3%;
    top: 17.6%;
    transform: translate(-50%, -50%) rotate(-90deg);
    background: var(--brand-1);
  }

  /* upper diagonal */
  .b2 {
    left: 37.2%;
    top: 27.3%;
    transform: translate(-50%, -50%) rotate(45deg);
    background: var(--brand-2);
  }

  /* left vertical face */
  .b3 {
    left: 24.1%;
    top: 50.8%;
    transform: translate(-50%, -50%);
    background: var(--brand-3);
  }

  /* lower diagonal */
  .b4 {
    left: 37.2%;
    top: 74.2%;
    transform: translate(-50%, -50%) rotate(-45deg);
    background: var(--brand-4);
  }

  /* bottom horizontal — the shaded face */
  .b5 {
    left: 69.3%;
    top: 83.9%;
    transform: translate(-50%, -50%) rotate(-90deg);
    background: var(--brand-5);
  }
</style>
