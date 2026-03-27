# design-token.md
> Test fixture for valid design tokens

---

## Project

Name: Test Project
Description: A test design system
Component library: Chakra UI
Styling: CSS Modules
Text styles: yes
Effect styles: yes

---

## Token Architecture

Two-tier system:
- **Primitives** — raw values only
- **Semantic** — aliases to primitives

Theme support: Light / Dark
Responsive support: Desktop / Mobile (typography only)

---

## Primitive Tokens

### Colors — Brand
```
color/brand/primary:       #00A7E1
color/brand/accent:        #003459
```

### Colors — Neutrals
```
color/neutral/900:         #0A0A0A
color/neutral/white:       #FFFFFF
```

### Spacing
```
space/1:                   4px
space/2:                   8px
space/4:                   16px
```

### Radii
```
radii/sm:                  4px
radii/md:                  8px
```

### Typography — Fonts
```
font/body:                 Inter, system-ui, sans-serif
font/heading:              Inter, system-ui, sans-serif
```

---

## Semantic Tokens

### Light Mode
```
color/bg/canvas:           {color/neutral/white}
color/text/primary:        {color/neutral/900}
```

### Dark Mode
```
color/bg/canvas:           {color/neutral/900}
color/text/primary:        {color/neutral/white}
```

---

## Typography Scale

### Desktop
```
body/md
  fontSize:                16px
  lineHeight:              24px
  fontWeight:              400

heading/lg
  fontSize:                32px
  lineHeight:              40px
  fontWeight:              700
```

### Mobile
```
body/md
  fontSize:                16px
  lineHeight:              24px
  fontWeight:              400

heading/lg
  fontSize:                28px
  lineHeight:              36px
  fontWeight:              700
```

---

## Component Token Map

### Button
```
background:                {color/brand/primary}
text:                      {color/neutral/white}
padding:                   {space/2} {space/4}
borderRadius:              {radii/md}
```
