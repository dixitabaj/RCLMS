<script>
    // If /icimod-logo.png is missing, the header falls back to text
    let logoFailed = false;
</script>

<header class="app-header">
    <h1>Regional Land Cover Monitoring System</h1>

 
</header>

<style>
    .app-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        min-height: clamp(52px, 8vh, 72px);
        padding: 8px clamp(12px, 1.5vw, 24px);
        background: #fff
        color: white;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        font-family: Lato, "Segoe UI", Arial, sans-serif;
    }

    h1 {
        margin: 0;
        font-size: clamp(16px, 2.4vw, 32px);
        font-weight: 400;
        line-height: 1.15;
    }

    .logo-link {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        color: inherit;
        text-decoration: none;
    }

    .logo {
        display: block;
        height: clamp(28px, 5vh, 44px);
        width: auto;
    }

    .brand {
        font-size: clamp(18px, 2.2vw, 30px);
        letter-spacing: 0.15em;
        font-weight: 300;
    }
</style>