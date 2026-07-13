<script lang="ts">
  import { Button, TextFieldOutlined } from "m3-svelte";
  import { login } from "../lib/stores/auth.svelte";

  let email = $state("");
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  const submit = async () => {
    if (busy || !email || !password) return;
    busy = true;
    error = null;
    error = await login(email.trim(), password);
    busy = false;
  };
</script>

<div class="login-page">
  <div class="brand">
    <img src="/icon-192.png" alt="" width="72" height="72" />
    <h1>Somni</h1>
  </div>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void submit();
    }}
  >
    <TextFieldOutlined label="Email" type="email" autocomplete="email" bind:value={email} />
    <TextFieldOutlined
      label="Password"
      type="password"
      autocomplete="current-password"
      bind:value={password}
      enter={() => void submit()}
    />
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <Button variant="filled" size="m" type="submit" disabled={busy || !email || !password}>
      {busy ? "Signing in…" : "Sign in"}
    </Button>
  </form>
</div>

<style>
  .login-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    padding: 2rem 1.5rem;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .brand img {
    border-radius: 1.25rem;
  }
  .brand h1 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 500;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 20rem;
  }
  form :global(button[type="submit"]) {
    min-height: 3rem;
    justify-content: center;
  }
  .error {
    margin: 0;
    color: var(--m3c-error);
    font-size: 0.875rem;
    text-align: center;
  }
</style>
