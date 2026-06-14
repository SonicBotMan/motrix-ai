<script setup lang="ts">
/**
 * OnboardingCard — 3-step welcome wizard
 *
 * Spec: docs/design/handoff/02-components.md §8
 *
 * Card: 480 × 600, centered. Top 3px gradient stripe (the only gradient in
 * the app): linear-gradient(135deg, --primary, --accent).
 *
 * Steps:
 *   0  Welcome  — logo + "Task-first download manager" + description + 3 bullets
 *   1  Theme    — Dark/Light/System toggle
 *   2  Quick    — show the 5 quick-action chips
 *
 * Step transitions: fadeSlideUp (250ms). Dots indicator shows current step.
 * Next advances; Skip jumps to completion. Esc does nothing (not skippable
 * via keyboard escape).
 */

import { ref, computed, watch } from 'vue'

interface Props {
  show: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  complete: []
}>()

const TOTAL_STEPS = 3
const currentStep = ref(0)
const selectedTheme = ref<'dark' | 'light' | 'system'>('dark')

/** Bumped on each step change to retrigger the fadeSlideUp keyframe */
const stepKey = ref(0)

const isLastStep = computed(() => currentStep.value === TOTAL_STEPS - 1)

/** The 3 bullets on step 0 */
const introBullets = [
  'Natural language commands',
  'No telemetry',
  'Torrents, HTTP, YouTube',
] as const

/** 5 quick-action chips on step 2 */
const quickChips = [
  'Download Ubuntu 24.04 LTS ISO',
  'What is downloading?',
  'Pause all',
  'Show completed',
  'Add magnet URL',
] as const

function next() {
  if (isLastStep.value) {
    complete()
    return
  }
  currentStep.value += 1
  stepKey.value += 1
}

function skip() {
  complete()
}

function complete() {
  emit('complete')
  // reset for next time it's shown
  currentStep.value = 0
  stepKey.value += 1
  selectedTheme.value = 'dark'
}

function selectTheme(theme: 'dark' | 'light' | 'system') {
  selectedTheme.value = theme
}

function pickChip() {
  // Picking a chip completes onboarding (parent can forward to chat)
  complete()
}

// Reset state whenever the card is shown fresh
watch(
  () => props.show,
  (visible) => {
    if (visible) {
      currentStep.value = 0
      stepKey.value = 0
      selectedTheme.value = 'dark'
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="props.show" class="onboarding-overlay">
      <div
        class="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboardingH1"
      >
        <!-- 3px gradient stripe — the ONLY gradient in the app -->
        <div class="onboarding-stripe" aria-hidden="true" />

        <div class="onboarding-body">
          <!-- ── Step 0: Welcome ─────────────────────────────────── -->
          <section
            v-if="currentStep === 0"
            :key="`step-${stepKey}`"
            class="onboarding-step"
          >
            <div class="onboarding-logo" aria-hidden="true">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <rect x="4" y="4" width="48" height="48" rx="12" fill="var(--primary)" />
                <path d="M18 38V18h4l8 12V18h4v20h-4l-8-12v12z" fill="#fff" />
              </svg>
            </div>
            <h1 id="onboardingH1" class="onboarding-title">Motrix AI</h1>
            <p class="onboarding-sub">
              Task-first desktop download manager.
              Watch the queue, then ask for more.
            </p>
            <ul class="onboarding-bullets">
              <li v-for="(b, i) in introBullets" :key="i" class="onboarding-bullet">
                <span class="bullet-dot" aria-hidden="true" />
                <span>{{ b }}</span>
              </li>
            </ul>
          </section>

          <!-- ── Step 1: Theme ───────────────────────────────────── -->
          <section
            v-else-if="currentStep === 1"
            :key="`step-${stepKey}`"
            class="onboarding-step"
          >
            <h1 id="onboardingH1" class="onboarding-title">Pick a theme</h1>
            <p class="onboarding-sub">
              Dark by default, light for daylight, system to follow your OS.
            </p>
            <div class="theme-cards" role="radiogroup" aria-label="Theme">
              <button
                v-for="theme in (['dark', 'light', 'system'] as const)"
                :key="theme"
                class="theme-card"
                role="radio"
                :aria-checked="selectedTheme === theme"
                :class="{ 'theme-card--active': selectedTheme === theme }"
                type="button"
                @click="selectTheme(theme)"
              >
                <div class="theme-preview" :class="`theme-preview--${theme}`">A</div>
                <div class="theme-card-label">{{ theme[0].toUpperCase() + theme.slice(1) }}</div>
              </button>
            </div>
          </section>

          <!-- ── Step 2: Quick action ────────────────────────────── -->
          <section
            v-else
            :key="`step-${stepKey}`"
            class="onboarding-step"
          >
            <h1 id="onboardingH1" class="onboarding-title">Try a command</h1>
            <p class="onboarding-sub">
              Type a magnet, URL, or pick one below.
            </p>
            <div class="chip-stack">
              <button
                v-for="(chip, i) in quickChips"
                :key="i"
                class="onboarding-chip"
                type="button"
                @click="pickChip"
              >{{ chip }}</button>
            </div>
          </section>
        </div>

        <!-- ── Footer: dots + buttons ──────────────────────────── -->
        <footer class="onboarding-footer">
          <div class="onboarding-dots" role="tablist" aria-label="Onboarding progress">
            <button
              v-for="i in TOTAL_STEPS"
              :key="i"
              class="onboarding-dot"
              :class="{ 'onboarding-dot--active': currentStep === i - 1 }"
              :aria-current="currentStep === i - 1 ? 'step' : undefined"
              :aria-label="`Step ${i}`"
              type="button"
              @click="currentStep = i - 1; stepKey += 1"
            />
          </div>
          <div class="onboarding-actions">
            <button
              v-if="!isLastStep"
              class="onboarding-btn onboarding-btn--ghost"
              type="button"
              @click="skip"
            >Skip</button>
            <button
              class="onboarding-btn onboarding-btn--primary"
              type="button"
              @click="next"
            >
              {{ isLastStep ? 'Open Motrix' : (currentStep === 0 ? 'Get Started →' : 'Continue') }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────── */
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-onboarding);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  animation: fadeSlideUp 250ms var(--ease-out);
}

/* ── Card ────────────────────────────────────────────────────────── */
.onboarding-card {
  position: relative;
  width: 480px;
  max-width: 94vw;
  min-height: 600px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

/* 3px gradient stripe — the ONLY gradient in the app */
.onboarding-stripe {
  height: 3px;
  width: 100%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
}

.onboarding-body {
  flex: 1 1 auto;
  padding: var(--space-8);
  display: flex;
  flex-direction: column;
}

/* --- Step transition: fadeSlideUp 250ms --- */
.onboarding-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  flex: 1 1 auto;
  animation: fadeSlideUp 250ms var(--ease-out);
}

/* ── Step 0: Welcome ─────────────────────────────────────────────── */
.onboarding-logo {
  margin-bottom: var(--space-5);
  display: inline-flex;
  filter: drop-shadow(var(--shadow-sm));
}

.onboarding-title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-display);
  font-weight: 600;
  line-height: 1.2;
  color: var(--fg);
}

.onboarding-sub {
  margin: 0 0 var(--space-6);
  font-family: var(--font-ui);
  font-size: var(--text-body-lg);
  font-weight: 400;
  line-height: 1.5;
  color: var(--fg-secondary);
  max-width: 360px;
}

.onboarding-bullets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
}

.onboarding-bullet {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--fg);
}

.bullet-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--primary);
}

/* ── Step 1: Theme cards ─────────────────────────────────────────── */
.theme-cards {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
  justify-content: center;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  width: 96px;
  padding: var(--space-3);
  background: transparent;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition-fast) var(--ease-out),
              background var(--transition-fast) var(--ease-out);
}

.theme-card:hover {
  border-color: var(--border-hover);
}

.theme-card:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.theme-card--active {
  border-color: var(--primary);
  background: var(--primary-muted);
}

.theme-preview {
  width: 56px;
  height: 40px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: var(--text-h2);
  font-weight: 600;
}

.theme-preview--dark {
  background: #0A0A0B;
  color: #FAFAFA;
  border: 1px solid #27272A;
}

.theme-preview--light {
  background: #FAFAFA;
  color: #111827;
  border: 1px solid #E5E7EB;
}

.theme-preview--system {
  background: linear-gradient(90deg, #0A0A0B 50%, #FAFAFA 50%);
  color: var(--primary);
  border: 1px solid var(--border);
}

.theme-card-label {
  font-family: var(--font-ui);
  font-size: var(--text-caption);
  font-weight: 500;
  color: var(--fg-secondary);
}

.theme-card--active .theme-card-label {
  color: var(--fg);
}

/* ── Step 2: Chips ───────────────────────────────────────────────── */
.chip-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-4);
  width: 100%;
  max-width: 340px;
}

.onboarding-chip {
  width: 100%;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  color: var(--fg-secondary);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: border-color var(--transition-fast) var(--ease-out),
              background var(--transition-fast) var(--ease-out),
              color var(--transition-fast) var(--ease-out),
              transform var(--transition-fast) var(--ease-out);
}

.onboarding-chip:hover {
  border-color: var(--fg);
  background: var(--surface-hover);
  color: var(--fg);
}

.onboarding-chip:active {
  transform: scale(0.97);
}

.onboarding-chip:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

/* ── Footer ──────────────────────────────────────────────────────── */
.onboarding-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-8);
  border-top: 1px solid var(--border);
}

.onboarding-dots {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.onboarding-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: 1px solid var(--fg-muted);
  border-radius: var(--radius-full);
  background: transparent;
  cursor: pointer;
  transition: background var(--transition-fast) var(--ease-out),
              border-color var(--transition-fast) var(--ease-out),
              width var(--transition-fast) var(--ease-out);
}

.onboarding-dot--active {
  width: 24px;
  background: var(--primary);
  border-color: var(--primary);
}

.onboarding-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.onboarding-btn {
  height: 36px;
  padding: 0 var(--space-4);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition-fast) var(--ease-out),
              border-color var(--transition-fast) var(--ease-out),
              color var(--transition-fast) var(--ease-out);
}

.onboarding-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.onboarding-btn--ghost {
  background: transparent;
  color: var(--fg-tertiary);
}

.onboarding-btn--ghost:hover {
  color: var(--fg);
  background: var(--surface-hover);
}

.onboarding-btn--primary {
  background: var(--primary);
  color: #fff;
}

.onboarding-btn--primary:hover {
  background: var(--primary-hover);
}
</style>
