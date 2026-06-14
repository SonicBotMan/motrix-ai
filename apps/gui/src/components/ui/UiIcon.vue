<script setup lang="ts">
/**
 * UiIcon — inline SVG icon from a sprite
 *
 * Renders an SVG referenced by `name`. Icons live in a `<symbol>` sprite
 * (see IconSprite.vue or an SVG sprite file loaded at app init).
 *
 * @example
 * <UiIcon name="download" :size="16" />
 * <UiIcon name="settings" :size="20" label="Settings" />
 */

import { computed } from 'vue'

interface Props {
  /** Icon name — must match a <symbol id="icon-{name}"> in the sprite */
  name: string
  /** Pixel size (width = height) */
  size?: number
  /** Accessible label; if omitted the icon is aria-hidden */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
  label: '',
})

const href = computed(() => `#icon-${props.name}`)
const isDecorative = computed(() => !props.label)
</script>

<template>
  <svg
    class="ui-icon"
    :width="props.size"
    :height="props.size"
    :role="isDecorative ? undefined : 'img'"
    :aria-label="isDecorative ? undefined : props.label"
    :aria-hidden="isDecorative"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <use :href="href" />
  </svg>
</template>

<style scoped>
.ui-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
