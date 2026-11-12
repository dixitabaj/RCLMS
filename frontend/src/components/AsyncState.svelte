<script>
  // Wraps any panel: shows error / loading / empty states, otherwise the content (slot).
  export let state;
  export let isEmpty = false;
  export let emptyText = 'No records for these filters.';
</script>

{#if state.error}
  <div class="msg error" role="alert">
    <strong>Could not load data.</strong> {state.error}
  </div>
{:else if state.loading && !state.data}
  <div class="msg" role="status"><span class="spinner"></span> Loading from the database…</div>
{:else if isEmpty}
  <div class="msg">{emptyText}</div>
{:else}
  <div class="content" class:stale={state.loading}><slot /></div>
{/if}

<style>
  .msg { padding: 18px 12px; color: #4a5a50; display: flex; align-items: center; gap: 10px; }
  .error { color: #8a1c1c; background: #fdeaea; border-radius: 6px; }
  .content { transition: opacity .15s; }
  .stale { opacity: .55; }
  .spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid #bcd8c6; border-top-color: #0a8f4e;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
</style>
