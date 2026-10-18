# Academy mascot assets

Original cartoon executive mascot approved by the owner in ChatGPT on 2026-10-18.
These are standalone static images, not facial or body animations.

| Filename stem | Intended use |
| --- | --- |
| welcome | Welcome / neutral approved base pose |
| thinking | Thinking before submission |
| guidance | Explanation / hint |
| correct | Correct answer feedback |
| retry | Encouragement to try again |
| celebration | Lesson complete |

Five standalone poses are delivered: welcome (approved base), thinking, guidance, correct and retry. Standalone celebration generation was blocked by the image service; no standalone celebration file is claimed. The previously approved six-pose sheet is retained as `collection.png` and includes the celebration pose.

Each delivered standalone pose has a transparent PNG master and a 512 × 768 WebP for UI use.
Serve WebP files at `/assets/academy/mascot/<stem>.webp`. Use `object-fit: contain`
and preserve the 2:3 aspect ratio. Do not stretch or crop the character.
For a decorative image next to equivalent feedback text, use an empty alt attribute.
If the image conveys information independently, provide a localized accessible label.

## Provenance

Generated with the built-in image generation tool using the owner's approved
original character image as the identity reference. The six poses were requested
as individual full-body images with consistent black suit, white shirt, dark
necktie, brown eyes, nearly bald head and small dark curl. Pose instructions:

- welcome: approved base pose with briefcase (the requested waving variant was blocked).
- thinking: hand at chin, looking slightly upward.
- guidance: one index finger raised, briefcase in other hand.
- correct: approving thumbs up and pleased small smile.
- retry: reassuring open palm and warm composed smile.
- celebration: delighted smile and both fists raised.

Common constraints: transparent background, full figure including shoes,
soft studio lighting, consistent stylized 3D appearance, no text or scenery.
PNG masters retain generated alpha. WebP copies are resized and encoded with
Pillow (quality 90). No exclusive rights or third-party license grant is asserted.

## Scope

This delivery adds image assets only. It does not connect the images to the
academy components, complete ACA-013, add the 12 subject roles, or deploy the app.
