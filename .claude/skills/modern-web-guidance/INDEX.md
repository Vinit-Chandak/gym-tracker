# Guide index

One line per guide: `<category>/<id>`, its title, and its opening sentence. Read the guide at `guides/<category>/<id>.md`.

## accessibility

- `accessibility/accessibility`: **Accessibility Coding Guidelines**. This guide provides actionable DOs and DON'Ts for AI coding agents to ensure web applications are accessible to all users, including those using assistive technologies.
- `accessibility/accessible-error-announcement`: **Accessible Error Announcement**. Standard HTML5 validation provides visual feedback (via `:invalid` or `:user-invalid`), but it doesn't automatically synchronize with accessibility attributes like `aria-invalid`.

## css

- `css/animate-to-intrinsic-sizes`: **Animate to Intrinsic Sizes**. Animating elements to dynamic sizes like `block-size: auto` or `inline-size: max-content` has historically required JavaScript or fragile "max-height" hacks.
- `css/calculate-with-intrinsic-sizes`: **Calculate With Intrinsic Sizes**. `calc-size()` is a CSS function for performing mathematical operations on intrinsic sizing keywords like `auto`, `min-content`, and `fit-content`.
- `css/child-state-based-styling`: **Child State Based Styling**. Historically, CSS selectors could only traverse downwards—you could style a child based on its parent, but not a parent based on its child.
- `css/content-based-styling`: **Content Based Styling**. Historically, applying different layouts to a component based on its content required either JavaScript or conditional logic in your HTML templating language to inject modifier classes (like `.card--h
- `css/css-layout`: **CSS Layouts and Responsive Design**. Lean on the browser's layout engine when possible for better performance.
- `css/css`: **CSS: Modern Architecture and Performance**. These guidelines provide a high-density reference for writing maintainable, performant, and standard-compliant CSS.
- `css/design-token-reactivity`: **Design Token Reactivity**. Often an author will need to make contextual changes to the design of a component.
- `css/dynamic-sibling-styling`: **Styling siblings based on count and index**. Historically, applying unique styles to each sibling in a list required complex `:nth-child` loops or JavaScript to inject inline styles.
- `css/fluid-scaling`: **Fluid Scaling**. Fluid scaling allows components to adjust their internal proportions (like font sizes and spacing) based on their current dimensions.
- `css/individual-transform-properties`: **Individual Transform Properties**. The `transform` property allows you to apply multiple transformations in a specified order, but any changes to a single transformation require re-specifying the entire transformation chain.
- `css/overflow-clipping-control`: **Overflow Clipping Control**. While `overflow: hidden` is a "blunt instrument" that almost always clips content strictly at the padding-box, `overflow: clip` combined with `overflow-clip-margin` provides the "scalpel" for fine-gra
- `css/reduce-style-repetition`: **Reduce Style Repetition with CSS Functions**. Maintaining large stylesheets often leads to repetitive logic, especially when dealing with design system tokens like gradients or responsive layout patterns.
- `css/size-aware-styling`: **Size Aware Styling**. Size-aware styling allows components to change their layout or appearance based on the space available to them, rather than the size of the whole screen.
- `css/style-parent-with-has`: **Style Parent with :has()**. Often, an error state requires styling elements *outside* the input itself—for example, changing the color of a parent `fieldset` border, highlighting the `<label>`, or showing a global error icon i
- `css/usage-aware-component-variations`: **Semantic Component Adaptation**. Use style queries (`@container style()`) to trigger contextual variations without hardcoding what produces or reacts to each context.

## forms

- `forms/animated-select-picker`: **Animated Select Picker**. The customizable select API offers a declarative, CSS-driven way to animate `<select>` elements and their dropdown pickers.
- `forms/autofill-address-form`: **Build an address form that follows best practice**. Create a form that makes it as easy as possible for users to enter address data on desktop and mobile.
- `forms/autofill-highlight-inputs`: **Use the CSS :autofill pseudo-class to highlight form fields that have been autofilled by the browser and not edited by the user**. Use the CSS `:autofill` to highlight fields that have (or have not been) autofilled, to help guide the user to successful form completion.
- `forms/autofill-payment-form`: **Build a payment form that follows best practice**. Payment forms are the single most critical part of the checkout process.
- `forms/autofill-sign-in-form`: **Build a sign-in form that follows best practice**. Use cross-platform browser features to build sign-in forms that are secure, accessible and easy to use.
- `forms/autofill-sign-up-form`: **Build a sign-up form that follows best practice**. Use cross-platform browser features to build sign-up forms that are secure, accessible and easy to use.
- `forms/brand-consistent-forms`: **Brand-Consistent Forms**. Customizing standard HTML form elements like checkboxes and radio buttons has historically been difficult.
- `forms/branded-select-styling`: **Branded Select Styling**. The customizable select API offers a declarative, CSS-driven way to style `<select>` elements to perfectly match your brand's design system.
- `forms/custom-select-picker-layouts`: **Custom Select Picker Layouts**. The CSS property `appearance: base-select` unlocks the ability to style a `<select>` element and its picker (via `::picker(select)`) like regular HTML elements.
- `forms/form-fields-automatically-fit-contents`: **Form Fields Automatically Fit Contents**. By default, form controls like `<input>`, `<textarea>`, and `<select>` have fixed dimensions.
- `forms/forms`: **Forms**. ```html
- `forms/ime-safe-enter-submit`: **IME-safe enter-to-submit**. Many chat interfaces submit their message when the user presses `Enter` in a `<textarea>`.
- `forms/required-field-feedback`: **Required Field Feedback**. Marking required fields with an error state immediately upon page load can be confusing.
- `forms/rich-media-picker`: **Rich Media Picker (Customizable Select)**. The native `<select>` element was historically difficult to style and could only contain plain text options.
- `forms/select-menu-interaction`: **Select Menu Interaction**. For mandatory dropdowns (e.g., "Choose a Country"), standard validation flags the field as invalid immediately if the default option has an empty value.
- `forms/validate-input-after-interaction`: **Validate Input After Interaction**. Displaying validation errors the moment a user focuses on a field and starts typing is premature and distracting.

## html

- `html/accessible-web-components`: **Accessible Web Components**. A shadow boundary changes how semantics and ARIA work.
- `html/custom-elements`: **Custom Elements**. A custom element is a class registered against a tag name via `customElements.define()`.
- `html/form-associated-custom-elements`: **Form-Associated Custom Elements**. Do not fall back to a hidden `<input>` to surface a custom control's value to a form.
- `html/html`: **HTML**. ```html
- `html/prerendering-custom-elements`: **Pre-rendering custom elements**. Pre-rendering means shipping a custom element's markup — including its shadow tree — from the server, so the component is styled and structured *before* any JavaScript runs.
- `html/shadow-dom`: **Shadow DOM, Templates & Slots**. A shadow root is an encapsulated DOM subtree attached to a host element: styles inside it do not leak out, and page styles do not leak in (except inherited properties).
- `html/styling-web-components`: **Styling Web Components**. Shadow DOM is a style boundary: page rules don't reach in and component rules don't leak out, except **inherited** properties (including custom properties).
- `html/web-components`: **Web Components Orientation**. Web Components are Custom Elements, Shadow DOM, and HTML Templates: the platform primitives for reusable, framework-agnostic components whose markup and styles are encapsulated from the document.

## js

- `js/calculate-event-differentials`: **Calculating Event Differentials with Temporal**. Calculating the time elapsed between events (such as trial expirations, subscription durations, or prorated costs) has historically been difficult with the legacy `Date` object due to complexities wit
- `js/capture-location-agnostic-data`: **Capturing Location-Agnostic Data with Temporal**. Recording chronological data that should remain identical regardless of the viewer's location (such as birthdates, recurring alarms, or national holidays) has historically been error-prone with the le
- `js/coordinate-global-events`: **Coordinating Global Events with Temporal**. Scheduling events across different time zones is notoriously difficult with the legacy `Date` object, especially around Daylight Saving Time (DST) transitions when hours can be skipped or repeated.
- `js/format-human-readable-durations`: **Formatting Human-Readable Durations with Temporal**. Presenting elapsed time or durations to users in a readable format (e.g., "1 hour and 30 minutes") has historically required manual math or external libraries.
- `js/manage-recurring-intervals`: **Managing Recurring Intervals with Temporal**. Calculating recurring intervals, such as subscription billing cycles or payroll periods, has historically been error-prone with the legacy `Date` object.
- `js/model-partial-time-concepts`: **Modeling Partial Time Concepts with Temporal**. Modeling date concepts that lack a full calendar date—such as credit card expirations, annual renewals, or daily alarms—has historically been error-prone with the legacy `Date` object.
- `js/stabilize-reactive-state`: **Stabilize Reactive State with Temporal**. While some reactive systems (like [React](https://react.dev/)) rely strictly on reference equality to detect state changes, others (like [Vue](https://vuejs.org/) and [Svelte](https://svelte.dev/)) ca
- `js/support-global-calendar-systems`: **Supporting Global Calendar Systems with Temporal**. The traditional JavaScript `Date` object is based on a proleptic Gregorian calendar, making it challenging to build applications for users who rely on other calendar systems, such as the Islamic (luna

## performance

- `performance/avoid-redundant-large-asset-downloads`: **Avoid redundant large asset downloads**. Large shared assets such as AI model weights, Wasm modules, game engine cores, or fully-bundled JavaScript libraries are often identical across many unrelated sites.
- `performance/batch-analytics-events`: **Debounce and batch multiple analytics events**. Most analytics and telemetry data is low priority and you can safely defer sending it until the user leaves the page.
- `performance/break-up-long-tasks`: **Break Up Long Tasks**. Heavy computations or long loops can block the main thread, causing the page to become unresponsive.
- `performance/calculate-total-foreground-time`: **Calculate total foreground time**. This guide details how to accurately calculate the total time a user spends actively viewing a page.
- `performance/conditional-async-dependencies`: **Conditional Async Dependencies**. Top-level `await` allows modules to act as asynchronous functions, meaning they can pause module execution to await promises.
- `performance/defer-rendering-heavy-content`: **Defer rendering heavy content**. Web pages with extensive content—such as infinite scrolls, complex dashboards, or dense articles can suffer from slow initial rendering and sluggish interactions.
- `performance/defer-work-until-scroll-ends`: **Defer Work Until Scroll Ends**. Scrolling on the web should be smooth and responsive.
- `performance/deliver-optimized-decorative-images`: **Deliver Optimized Decorative Images**. Delivering optimized decorative images via CSS improves perceived performance without sacrificing visual quality.
- `performance/deprioritize-background-fetches`: **Deprioritize background fetches**. When a page performs multiple simultaneous network requests, they often compete for the same bandwidth.
- `performance/detect-initial-visibility-state`: **Detect Initial Visibility State**. Determining if a page was initially loaded in the background (e.g., opened in a new background tab) is critical for accurate performance monitoring.
- `performance/efficient-background-processing`: **Efficient Background Processing**. Pause heavy background tasks when a component is not being rendered by the browser to conserve system resources and battery life.
- `performance/faster-spa-view-transitions`: **Faster SPA View Transitions via State Caching**. Enable instant navigation between views in a Single-Page Application (SPA) by caching the rendered state of inactive views instead of destroying them.
- `performance/flicker-free-client-side-ab-testing`: **Flicker-Free Client-Side A/B Testing**. Client-side A/B testing tools work by loading a script that modifies the DOM after the browser has already begun constructing the page.
- `performance/full-session-analytics`: **Reliably measure full-session analytics and telemetry**. To reliably analytics and telemetry data that covers the entirety of a user's visit to a web page (not just until page load) use the `fetchLater()` API.
- `performance/identify-heavy-scripts`: **Identify heavy-running JavaScript**. Heavy-running JavaScript can have a detrimental effect on both page load performance and interactivity.
- `performance/identify-inp-causes`: **Identify causes of poor INP**. Poor responsiveness to interactions leads to a poor impression of a page being slow or even completely broken.
- `performance/improve-next-page-load-performance`: **Improve next page load performance**. One of the most effective ways to improve page load performance for users navigating a site is to initiate loading the next page they're about to visit *before* they visit it.
- `performance/interactions-in-complex-layouts`: **Optimizing Interactions in Complex Layouts**. Maintain high frame rates (60FPS) and eliminate interaction latency during drag-and-drop or heavy mutations in complex, multi-column layouts like Kanban boards or massive data grids.
- `performance/load-shared-resources-declaratively`: **Load shared resources declaratively**. Popular scripts, stylesheets, and JavaScript modules, such as UI frameworks or widget libraries served from a CDN, are byte-for-byte identical across many unrelated sites, yet every site's visitors do
- `performance/optimize-image-priority`: **Optimize image priority**. Browsers use heuristics to assign loading priorities to images, but these defaults may not always align with your page's Largest Contentful Paint (LCP).
- `performance/optimize-preload-priority`: **Optimize preload priority**. Preloading resources with `<link rel="preload">` signals to the browser that a resource will be needed soon.
- `performance/optimize-script-priority`: **Optimize script priority**. Browsers assign default priorities to scripts based on where they appear in the document and whether they have attributes like `async` or `defer`.
- `performance/out-of-order-html-streaming`: **Out-of-Order (OOO) HTML Streaming**. Out-of-Order (OOO) HTML Streaming (also known as Declarative Partial Updates) is an alternative to the traditional "top-to-bottom" linear processing of HTML.
- `performance/performance`: **Performance**. The Critical Rendering Path dictates how quickly the browser converts HTML, CSS, and JavaScript into painted pixels.
- `performance/resolution-optimized-pseudo-elements`: **Resolution Optimized Pseudo Elements**. Using resolution-optimized images in CSS pseudo-elements (like `::before` or `::after`) allows you to add decorative icons or structural graphics without cluttering your HTML with extra DOM nodes.
- `performance/schedule-tasks-by-priority`: **Schedule Tasks By Priority**. When building complex web applications, tasks have different levels of urgency.
- `performance/sequence-distributed-events`: **Sequencing Distributed Events**. High-frequency tracing and event logging in distributed systems require precise timestamps to ensure correct causal ordering.
- `performance/share-web-fonts-across-origins`: **Share web fonts across origins**. Large icon fonts, emoji fonts, and fonts with extensive Unicode coverage are downloaded across an enormous number of unrelated sites every day, even though most visitors already hold an identical copy

## privacy

- `privacy/privacy`: **Web Privacy Guidelines for Developers**. Web application developers must treat privacy as a foundational architectural requirement, not just a legal compliance checkbox.

## pwa

- `pwa/migrate-web-app-origin`: **Migrating the Origin of an Installed Web App**. Transferring an installed web app (PWA) to a new origin typically requires users to manually uninstall the old app and reinstall the new one.

## security

- `security/local-network-access`: **Local Network Access**. When a web application served from a `public` origin (or an intranet `local` origin) connects to a user's private local network (such as a LAN printer, IoT hub, or router at `192.168.1.x` or `device.l
- `security/passkey-authentication`: **Passkey Authentication**. This guide details how to implement returning user authentication using discoverable credentials, both through explicit button triggers and seamless browser autofill suggestions (Conditional UI).
- `security/passkey-conditional-create`: **Passkey Conditional Create (Post-Login Promotion)**. This guide details how to automatically and silently register a passkey for a user immediately after a successful password-based sign-in, minimizing friction and boosting passkey adoption.
- `security/passkey-management`: **Passkey Management**. This guide details how to enable users to view, rename, and delete their registered passkeys while keeping saved credentials perfectly synchronized between the server and the user's password managers 
- `security/passkey-reauthentication`: **Passkey Reauthentication**. This delta-focused guide details how to implement step-up authentication or re-verification for a signed-in user before they perform sensitive account changes (e.g.
- `security/passkey-registration`: **Passkey Registration**. This guide details how to enable users to register a passkey for their account, providing a highly secure, phishing-resistant passwordless sign-in alternative.
- `security/passkeys`: **Passkeys Orientation**. This guide provides high-density, action-oriented orientation for implementing secure, framework-agnostic passkey authentication and credential management in modern web applications.
- `security/sanitize-untrusted-html`: **Sanitizing Untrusted HTML**. Safely displaying user-generated HTML is a common security challenge.
- `security/security`: **Web Security**. Guidelines for implementing preventative security measures on the web safely and incrementally.
- `security/trusted-types`: **Prevent DOM-based XSS attacks with Trusted Types**. Trusted Types is a security feature that helps prevent DOM-based Cross-Site Scripting (DOM XSS) by requiring that data being passed into "dangerous" browser APIs (known as sinks) is first converted in

## ui-atoms

- `ui-atoms/carousel-slide-effects`: **Build Carousel Slide Effects**. Carousel slide effects are a great way to add visual interest to a carousel.
- `ui-atoms/component-specific-light-dark-theme`: **Component-specific light/dark themes**. While more commonly set on the root, the `color-scheme` property can be set on individual elements to force them into a different color scheme from the rest of the page.
- `ui-atoms/position-aware-tooltips`: **Position Aware Tooltips**. When building tooltips or popovers with CSS Anchor Positioning, the browser can automatically "flip" the element to a fallback position if it would otherwise overflow the viewport.
- `ui-atoms/pull-to-reveal`: **Pull to Reveal**. The CSS property `scroll-initial-target` offers a declarative, CSS-only way to implement this pattern.
- `ui-atoms/resilient-context-menus-and-nested-dropdowns`: **Resilient Context Menus And Nested Dropdowns**. A revealed action panel or popover button group is a useful pattern for users to access additional functionality while taking up minimal space.
- `ui-atoms/responsive-table`: **Responsive tables**. Large data tables often become unreadable on small screens as columns overflow or shrink beyond legibility.
- `ui-atoms/scroll-position-aware-elements`: **Scroll Position Aware Elements**. Improve the user experience of floating buttons, like a "Back to Top" link, by showing them only when they are useful.
- `ui-atoms/scroll-progress-indicator`: **Build a Scroll Progress Indicator**. A scroll progress indicator is a common user interface pattern that visually communicates the user's progress through a scrollable document or container.
- `ui-atoms/scrollability-affordance-hints`: **Scrollability Affordance Hints**. Visual hints, like shadows or gradients, help users understand that they can scroll to see more content.
- `ui-atoms/shrinking-header-on-scroll`: **Shrinking header on scroll**. A shrinking header on scroll is a common UI pattern where a fixed header element at the top of the page smoothly transitions to a smaller size as the user scrolls down.
- `ui-atoms/state-aware-sticky-headers`: **State-Aware Sticky Headers**. Sticky headers are a common UI pattern, but they often need to change their appearance when they become "stuck" to maintain readability or save space.

## ui-behaviors

- `ui-behaviors/anchor-positioning-tab-underline`: **Anchor Positioning Tab Underline**. In a tab menu, you should provide visual hints to users about what page they are on.
- `ui-behaviors/animate-element-entry-exit`: **Animate Element Entry and Exit**. In the past, CSS transitions could not animate elements when they were first added to the DOM or when their `display` property changed from `none`.
- `ui-behaviors/animate-to-from-top-layer`: **Animate Elements To and From Top Layer**. Elements that render in the "top layer" (like `<dialog>`, elements with the `popover` attribute, or tooltips) have historically been difficult to animate because they toggle between `display: none` an
- `ui-behaviors/carousel-snap-highlights`: **Carousel Snap Highlights**. Scroll-state container queries allow you to style elements based on their current scroll state, such as whether an element is "stuck" (via sticky positioning) or "snapped" (via scroll snapping).
- `ui-behaviors/consistent-cross-document-transitions`: **Consistent Cross-Document Transitions**. Cross-document view transitions animate elements between two pages during a same-origin navigation.
- `ui-behaviors/cross-document-transitions`: **Cross-Document Transitions**. Cross-document view transitions allow you to create smooth, app-like transitions between different pages of a Multi-Page Application (MPA).
- `ui-behaviors/custom-button-actions`: **Custom Button Actions**. The Invoker Commands API allows buttons to trigger actions on target elements declaratively using HTML attributes.
- `ui-behaviors/declarative-dialog-popover-control`: **Declarative Dialog and Popover Control**. Use the Invoker Commands API to toggle the visibility of `<dialog>` and `[popover]` elements directly from HTML buttons, eliminating the need for custom JavaScript event listeners.
- `ui-behaviors/directional-navigation-transitions`: **Directional Navigation Transitions**. Single Page Applications (SPAs) provide the appearance of navigation by replacing the content of the page without navigating to a new page.
- `ui-behaviors/dynamic-sibling-animations`: **Creating a stagger animation**. Stagger animations provide an interesting effect where multiple ordered elements animate sequentially with a slight delay between each, rather than all animating at once.
- `ui-behaviors/group-element-transitions`: **Group Element Transitions**. As items are added or removed from a list, or rearranged, transitions can help users maintain context.
- `ui-behaviors/highlight-text-ranges`: **Highlight Text Ranges**. The CSS Custom Highlight API lets you style arbitrary text ranges on a page without modifying the DOM structure.
- `ui-behaviors/interactive-content-reveal`: **Interactive Content Reveal**. Add performant, interactive reveal effects to your site with CSS masks and registered custom properties.
- `ui-behaviors/interest-triggered-action-previews`: **Interest Triggered Action Previews**. It can be beneficial to provide users a preview of their actions before they commit to them.
- `ui-behaviors/interest-triggered-tooltips`: **Show a tooltip when hovering**. Users expect to see additional related information without completely changing their context.
- `ui-behaviors/light-dismiss-a-dialog`: **Light-Dismiss a Dialog**. Modern modal dialogs often support "light-dismiss," allowing users to close a dialog by clicking or tapping the backdrop (the area outside the dialog).
- `ui-behaviors/move-dom-element-without-losing-state`: **Move DOM Element Without Losing State**. When reparenting DOM elements using traditional methods like `appendChild()` or `insertBefore()`, the browser implicitly removes the element from the DOM and then inserts it into its new location.
- `ui-behaviors/parallax-scroll-effects`: **Build a Parallax Effect on Scroll**. A parallax effect on scroll is a visual technique where different layers of content move at varying speeds as the user scrolls down a page.
- `ui-behaviors/persistent-top-layer-ui`: **Persistent Top Layer UI**. When moving an open `<dialog>`, `popover`, or fullscreen element in the DOM using traditional methods like `appendChild()` or `insertBefore()`, the browser implicitly removes the element from the DOM 
- `ui-behaviors/physics-based-easing`: **Physics Based Easing**. Traditional CSS easing functions like `ease-in` or `cubic-bezier()` are limited to simple curves, making it impossible to create complex physics-based effects like bounces or springs.
- `ui-behaviors/platform-controls-dismiss-dialog`: **Platform Controls Dismiss Dialog**. When a modal dialog is open, users expect to use familiar controls to dismiss them: pressing the <kbd>Esc</kbd> key on a keyboard, using the back button or gesture on mobile platforms, or a dismiss ge
- `ui-behaviors/same-document-transitions`: **Same Document Transitions**. Web sites often provide multiple views of an object, for instance a list of products, and then a detail page for each product.
- `ui-behaviors/scroll-entry-exit-effects`: **Add entry and exit effects to elements as they enter or exit the scrollport**. Entry and exit effects are animations that are triggered when an element enters or leaves the viewport.
- `ui-behaviors/scroll-snap-realtime-feedback`: **Scroll Snap Real-Time Feedback**. Users expect immediate visual feedback when interacting with UI elements like carousels or galleries.
- `ui-behaviors/scroll-snap-state-sync`: **Scroll Snap State Sync**. Synchronizing UI state with a scrollable container's snap position traditionally required complex scroll event listeners, manual calculations of scroll offsets, and intersection observers.
- `ui-behaviors/scroll-target-on-load`: **Set a scroll target for the initial render**. The CSS property `scroll-initial-target` offers a declarative, CSS-only way to bring a specific descendant element into the visible area of its scroll container as soon as that container is rendered.
- `ui-behaviors/scrollytelling`: **Scrollytelling**. Scrollytelling is a popular technique used to create engaging and immersive web experiences.
- `ui-behaviors/search-hidden-content`: **Search hidden content**. Web interfaces often hide content from view to improve the user experience, save screen space, or increase page performance.
- `ui-behaviors/spatial-navigation`: **Spatial Navigation (Directional Keypad Focus)**. Directional focus navigation (using arrow keys or D-Pads) enables keyboard-only and alternative-input users to navigate interactive items based on their visual 2D layout.
- `ui-behaviors/swipe-to-remove`: **Swipe to remove**. Swipe-to-remove patterns are common in mobile applications but can be challenging to implement cleanly on the web.

## ui-components

- `ui-components/navigation-drawer`: **Navigation Drawer**. A navigation drawer is a panel that slides in from the edge of the viewport over the page content, dimming everything behind it.
- `ui-components/persistent-app-tours`: **Creating Persistent App Tours**. Onboarding tours require overlays that persist while users interact with the highlighted features.
- `ui-components/persistent-toast-notifications`: **Creating Toast Notifications**. Toast notifications are transient status messages.
- `ui-components/progress-ring`: **Progress ring**. A progress ring (or circular progress bar) provides visual feedback on the status of a task.
- `ui-components/scrollspy`: **Build a Scrollspy Navigation**. A scrollspy navigation is a common UI pattern that automatically highlights the navigation link corresponding to the section of the page currently in the viewport.
- `ui-components/spinner`: **Loading spinner**. A loading spinner (or activity indicator) informs users that a process is underway when the exact duration is unknown.
- `ui-components/stack-drill-down`: **Stack Drill Down**. A stack drill-down is a hierarchical navigation pattern, common in mobile apps, where activating a link pushes a new full-screen view on top of the previous one.

## visual-design

- `visual-design/adapt-scrollbar-to-contrast-preferences`: **Adapt scrollbar to high-contrast preferences**. Users who enable high-contrast modes in their operating system or browser expect UI elements (like scrollbars) to be extremely legible, often relying on stark foreground-background separation rather t
- `visual-design/apply-webgl-shaders`: **Apply WebGL shaders to HTML content**. WebGL shaders provide powerful GPU-accelerated visual effects, enabling advanced capabilities like dynamic ripple distortions, lighting models, color grading, and custom vertex transformations.
- `visual-design/complex-shapes`: **Complex Shapes**. To clip elements to complex, free-form shapes like brush strokes or organic textures, use CSS Masking (`mask-image`).
- `visual-design/contrast-color`: **Ensure text readability with dynamic background colors**. When building reusable UI components (like badges or buttons) or supporting dynamic themes, ensuring text is readable against an unpredictable background color can be challenging.
- `visual-design/customize-scrollbar-color-and-thickness`: **Customize the color or thickness of a scrollbar**. You can customize the appearance of scrollbars using the standard CSS properties `scrollbar-color` and `scrollbar-width`.
- `visual-design/dark-mode`: **Dark mode**. The `color-scheme` property indicates which color schemes (such as light or dark) your page supports.
- `visual-design/export-html-media-from-canvas`: **Export HTML content from canvas**. Web applications frequently need to capture and export rich HTML content—such as customized dashboards, styled documents, or interactive charts—as static images or video recordings.
- `visual-design/expose-canvas-content-to-browser-features`: **Expose canvas content to browser features**. Regular `<canvas>` content is not exposed to browser features such as screen readers, indexing, translation tools, accessibility assistive tools, find-in-page, print, etc.
- `visual-design/improve-text-layout-and-legibility`: **Improve Text Layout and Legibility**. The layout of text, particularly at the ends of lines and ends of paragraphs, can impact the legibility and aesthetic appeal of a page.
- `visual-design/interactive-content-in-3d-scenes`: **Enable interactive HTML content in 3D scenes**. The HTML-in-Canvas API allows rendering real DOM directly inside a canvas element.
- `visual-design/precise-text-alignment`: **Precise Text Alignment**. Browsers automatically add extra whitespace above and below text characters to accommodate line-height and font-specific metrics like ascenders and descenders.
- `visual-design/shaped-cutouts`: **Shaped Cutouts**. CSS Masking allows you to clip an element to a custom shape, such as adding a notch to a card or creating a shaped border.
- `visual-design/soft-edge-content-fade`: **Soft Edge Content Fade**. To apply a transparency gradient to the edges of a container (e.g., to indicate more content is available to scroll or to fade out text), use CSS Masking with a linear gradient.
- `visual-design/visually-stable-font-fallbacks`: **Visually Stable Font Fallbacks**. When web fonts load, they often replace a fallback font that has different dimensions, even if both are set to the same `font-size`.
- `visual-design/visually-stable-mixed-fonts`: **Visually Stable Mixed Fonts**. When mixing different font families, for instance when inserting inline code snippets, or switching out font families for different themes, differences in "x-height" (the height of lowercase letters) 
- `visual-design/visually-texture-content`: **Visually Texture Content**. To apply realistic weathering or texture patterns (like grunge, noise, or paper texture) to an element, use CSS Masking (`mask-image`) with a repeating texture image.
