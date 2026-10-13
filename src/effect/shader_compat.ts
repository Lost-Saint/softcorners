/** @file Feature detection for Clutter shader effects across GNOME versions. */

import Shell from 'gi://Shell';

/**
 * GNOME 51 removed Shell.GLSLEffect; effects must extend
 * Clutter.ShaderEffect with a static Cogl.Snippet instead
 * (https://gjs.guide/extensions/upgrading/gnome-shell-51.html).
 * Detect the old class so one codebase runs on both 50 and 51
 * (https://gjs.guide/extensions/development/targeting-older-gnome.html#feature-detection).
 */
export const hasLegacyShaderEffect = 'GLSLEffect' in Shell;
