<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  login: [username: string, password: string]
  signup: [username: string, password: string]
}>()

const mode = ref<'login' | 'signup'>('login')
const username = ref('')
const password = ref('')

const title = () => (mode.value === 'login' ? 'Welcome back' : 'Create your planner')
const action = () => (mode.value === 'login' ? 'Log in' : 'Sign up')

function submit() {
  const name = username.value.trim()
  if (!name || !password.value || props.busy) return
  if (mode.value === 'login') emit('login', name, password.value)
  else emit('signup', name, password.value)
}

function toggle() {
  mode.value = mode.value === 'login' ? 'signup' : 'login'
}
</script>

<template>
  <div class="auth-page">
    <p class="brand">Cozy Budget</p>
    <h1>{{ title() }}</h1>
    <p class="tagline">
      {{
        mode === 'login'
          ? 'Sign in to open your planner.'
          : 'Pick a username to start your own planner.'
      }}
    </p>

    <form class="auth-form" @submit.prevent="submit">
      <label class="field">
        Username
        <input
          v-model="username"
          type="text"
          autocomplete="username"
          maxlength="32"
          required
        />
      </label>
      <label class="field">
        Password
        <input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          minlength="8"
          required
        />
      </label>
      <p v-if="error" class="status error" role="alert">{{ error }}</p>
      <button class="submit" type="submit" :disabled="busy">
        {{ busy ? 'Please wait…' : action() }}
      </button>
    </form>

    <button type="button" class="switch" @click="toggle">
      {{
        mode === 'login'
          ? 'Need an account? Sign up'
          : 'Already have an account? Log in'
      }}
    </button>
  </div>
</template>

<style scoped>
.auth-page {
  width: 100%;
  text-align: left;
}

.brand {
  margin: 0 0 0.6rem;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--mint-deep);
}

h1 {
  margin: 0 0 0.4rem;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 6vw, 2.4rem);
  font-weight: 700;
  line-height: 1.1;
  color: var(--ink);
}

.tagline {
  margin: 0 0 1.4rem;
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--ink-soft);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.field input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1.5px solid color-mix(in srgb, var(--mint) 40%, transparent);
  background: color-mix(in srgb, var(--paper) 80%, white);
  font-family: var(--font-body);
  font-size: 0.98rem;
  font-weight: 500;
  color: var(--ink);
  outline: none;
}

.field input:focus {
  border-color: var(--mint-deep);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mint) 35%, transparent);
}

.status.error {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--blush-deep);
}

.submit {
  align-self: center;
  margin-top: 0.25rem;
  height: 2.7rem;
  padding: 0 1.6rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--mint), var(--blush));
  color: white;
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}

.submit:disabled {
  opacity: 0.7;
  cursor: wait;
}

.switch {
  display: block;
  margin: 1rem auto 0;
  border: none;
  background: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--mint-deep);
  cursor: pointer;
}
</style>
