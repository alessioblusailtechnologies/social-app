/* @ds-bundle: {"format":4,"namespace":"ModuloDesignSystem_845237","components":[{"name":"PageIndicator","sourcePath":"components/brand/PageIndicator.jsx"},{"name":"PatternGrid","sourcePath":"components/brand/PatternGrid.jsx"},{"name":"SHAPE_KINDS","sourcePath":"components/brand/ShapeTile.jsx"},{"name":"ShapeTile","sourcePath":"components/brand/ShapeTile.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"}],"sourceHashes":{"components/brand/PageIndicator.jsx":"88dcc8edfb1f","components/brand/PatternGrid.jsx":"f71b624bbbba","components/brand/ShapeTile.jsx":"c884226ba0a8","components/core/Badge.jsx":"ab9f96a6987f","components/core/Button.jsx":"66a7ee2be773","components/core/IconButton.jsx":"2c1c3725fd97","components/forms/Checkbox.jsx":"fde10f791ad4","components/forms/Input.jsx":"863a66d3fcde","components/forms/Switch.jsx":"84120ae0cc41","components/surfaces/Card.jsx":"1f120fa1d038","ui_kits/onboarding/OnboardingScreen.jsx":"83d0a23902fb","ui_kits/onboarding/PhoneFrame.jsx":"b165cbe679de"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ModuloDesignSystem_845237 = window.ModuloDesignSystem_845237 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/PageIndicator.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Three-dot onboarding indicator: outlined dots for the steps not reached,
   a solid navy dot for the current one. */
function PageIndicator({
  count = 3,
  active = 0,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      alignItems: 'center',
      justifyContent: 'center',
      ...style
    }
  }, rest), Array.from({
    length: count
  }).map((_, i) => {
    const on = i === active;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      "aria-label": `Step ${i + 1}`,
      "aria-current": on || undefined,
      onClick: onChange ? () => onChange(i) : undefined,
      style: {
        width: 11,
        height: 11,
        padding: 0,
        borderRadius: 'var(--radius-full)',
        border: `1.5px solid var(--border-strong)`,
        background: on ? 'var(--navy-700)' : 'transparent',
        cursor: onChange ? 'pointer' : 'default',
        transition: `background var(--dur-base) var(--ease-standard)`
      }
    });
  }));
}
Object.assign(__ds_scope, { PageIndicator });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/PageIndicator.jsx", error: String((e && e.message) || e) }); }

// components/brand/ShapeTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SHAPE_KINDS = ['circle', 'half', 'quarter', 'leaf', 'donut', 'dot', 'solid'];

/* One module of the Bauhaus grid: a square tile holding exactly one elementary
   geometric form. Rotation is applied to the whole tile, so four rotations of a
   handful of kinds generate the whole pattern vocabulary. */
function ShapeTile({
  kind = 'quarter',
  color = 'var(--shape-1)',
  background = 'var(--surface-card)',
  rotation = 0,
  size,
  style,
  ...rest
}) {
  const wrap = {
    position: 'relative',
    background,
    width: size,
    height: size,
    aspectRatio: size ? undefined : '1 / 1',
    overflow: 'hidden',
    transform: `rotate(${rotation}deg)`,
    ...style
  };
  const fill = {
    position: 'absolute',
    inset: 0,
    background: color
  };
  let shape;
  if (kind === 'solid') shape = /*#__PURE__*/React.createElement("span", {
    style: fill
  });else if (kind === 'circle') shape = /*#__PURE__*/React.createElement("span", {
    style: {
      ...fill,
      borderRadius: 'var(--radius-full)'
    }
  });else if (kind === 'half') shape = /*#__PURE__*/React.createElement("span", {
    style: {
      ...fill,
      bottom: '50%',
      borderRadius: '100% 100% 0 0'
    }
  });else if (kind === 'quarter') shape = /*#__PURE__*/React.createElement("span", {
    style: {
      ...fill,
      borderRadius: 'var(--radius-quarter)'
    }
  });else if (kind === 'leaf') shape = /*#__PURE__*/React.createElement("span", {
    style: {
      ...fill,
      borderRadius: 'var(--radius-leaf)'
    }
  });else if (kind === 'donut') shape = /*#__PURE__*/React.createElement("span", {
    style: {
      ...fill,
      borderRadius: 'var(--radius-full)',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: '46%',
      height: '46%',
      borderRadius: 'var(--radius-full)',
      background
    }
  }));else if (kind === 'dot') shape = /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: '32%',
      borderRadius: 'var(--radius-full)',
      background: color
    }
  });
  return /*#__PURE__*/React.createElement("div", _extends({
    style: wrap
  }, rest), shape);
}
Object.assign(__ds_scope, { SHAPE_KINDS, ShapeTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/ShapeTile.jsx", error: String((e && e.message) || e) }); }

// components/brand/PatternGrid.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const PALETTE = ['var(--shape-1)', 'var(--shape-2)', 'var(--shape-3)', 'var(--shape-4)', 'var(--shape-5)', 'var(--shape-6)'];
const GROUNDS = ['var(--surface-card)', 'var(--surface-card)', 'var(--surface-sunken)', 'var(--surface-card)'];
const KINDS = ['quarter', 'quarter', 'leaf', 'half', 'circle', 'quarter', 'leaf', 'donut', 'dot'];

/* Deterministic PRNG so a given `seed` always yields the same composition —
   patterns must be reproducible between a mock and the build. */
function rng(seed) {
  let s = seed * 2654435761 % 2147483647;
  return () => (s = s * 48271 % 2147483647) / 2147483647;
}

/* The heart of the system: a modular grid of squares, each holding one
   elementary form. Apparently random, tightly controlled. */
function PatternGrid({
  columns = 4,
  rows = 4,
  seed = 7,
  palette = PALETTE,
  grounds = GROUNDS,
  kinds = KINDS,
  gap = 0,
  style,
  ...rest
}) {
  const rand = rng(seed || 1);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const tiles = [];
  for (let i = 0; i < columns * rows; i++) {
    const ground = pick(grounds);
    let color = pick(palette);
    if (color === ground) color = palette[(palette.indexOf(color) + 2) % palette.length];
    tiles.push({
      kind: pick(kinds),
      color,
      background: ground,
      rotation: Math.floor(rand() * 4) * 90
    });
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap,
      background: 'var(--surface-card)',
      ...style
    },
    "aria-hidden": "true"
  }, rest), tiles.map((t, i) => /*#__PURE__*/React.createElement(__ds_scope.ShapeTile, _extends({
    key: i
  }, t))));
}
Object.assign(__ds_scope, { PatternGrid });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/PatternGrid.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  navy: {
    background: 'var(--navy-700)',
    color: 'var(--white)'
  },
  coral: {
    background: 'var(--orange-500)',
    color: 'var(--white)'
  },
  lime: {
    background: 'var(--lime-400)',
    color: 'var(--navy-700)'
  },
  mint: {
    background: 'var(--mint-400)',
    color: 'var(--navy-700)'
  },
  yellow: {
    background: 'var(--yellow-400)',
    color: 'var(--navy-700)'
  },
  neutral: {
    background: 'var(--grey-100)',
    color: 'var(--navy-700)'
  }
};
function Badge({
  tone = 'navy',
  outline = false,
  shape = 'pill',
  children,
  style,
  ...rest
}) {
  const t = TONES[tone];
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 24,
      padding: '0 12px',
      borderRadius: shape === 'pill' ? 'var(--radius-pill)' : shape === 'leaf' ? 'var(--radius-leaf)' : 'var(--radius-sm)',
      font: 'var(--weight-semibold) 11px/1 var(--font-core)',
      letterSpacing: 'var(--tracking-caps)',
      textTransform: 'uppercase',
      ...(outline ? {
        background: 'transparent',
        color: 'var(--navy-700)',
        boxShadow: 'inset 0 0 0 1.5px var(--border-strong)'
      } : t),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    height: 36,
    padding: '0 18px',
    font: 'var(--weight-semibold) 12px/1 var(--font-core)'
  },
  md: {
    height: 44,
    padding: '0 24px',
    font: 'var(--weight-semibold) 13px/1 var(--font-core)'
  },
  lg: {
    height: 52,
    padding: '0 32px',
    font: 'var(--weight-semibold) 14px/1 var(--font-core)'
  }
};
const VARIANTS = {
  primary: {
    background: 'var(--action-primary)',
    color: 'var(--white)',
    border: '1.5px solid var(--action-primary)'
  },
  accent: {
    background: 'var(--action-accent)',
    color: 'var(--white)',
    border: '1.5px solid var(--action-accent)'
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-title)',
    border: '1.5px solid var(--border-strong)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-title)',
    border: '1.5px solid transparent'
  },
  inverse: {
    background: 'var(--white)',
    color: 'var(--text-title)',
    border: '1.5px solid var(--white)'
  }
};
const HOVER = {
  primary: {
    background: 'var(--action-primary-hover)',
    borderColor: 'var(--action-primary-hover)'
  },
  accent: {
    background: 'var(--action-accent-hover)',
    borderColor: 'var(--action-accent-hover)'
  },
  secondary: {
    background: 'var(--surface-sunken)'
  },
  ghost: {
    background: 'var(--surface-sunken)'
  },
  inverse: {
    background: 'var(--grey-100)',
    borderColor: 'var(--grey-100)'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  iconLeft,
  iconRight,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      display: block ? 'flex' : 'inline-flex',
      width: block ? '100%' : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-2)',
      borderRadius: 'var(--radius-pill)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      letterSpacing: '.01em',
      whiteSpace: 'nowrap',
      transition: 'background var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
      ...SIZES[size],
      ...VARIANTS[variant],
      ...(hover && !disabled ? HOVER[variant] : null),
      transform: press && !disabled ? 'scale(var(--press-scale))' : 'none',
      ...(disabled ? {
        background: 'var(--grey-100)',
        borderColor: 'var(--grey-100)',
        color: 'var(--text-disabled)'
      } : null),
      ...style
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 32,
  md: 40,
  lg: 48
};
function IconButton({
  variant = 'solid',
  size = 'md',
  label,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const d = SIZES[size];
  const variants = {
    solid: {
      background: 'var(--navy-700)',
      color: 'var(--white)',
      border: 'none'
    },
    dark: {
      background: 'var(--black)',
      color: 'var(--white)',
      border: 'none'
    },
    outline: {
      background: 'transparent',
      color: 'var(--text-title)',
      border: '1.5px solid var(--border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-title)',
      border: 'none'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: d,
      height: d,
      display: 'inline-grid',
      placeItems: 'center',
      padding: 0,
      borderRadius: 'var(--radius-full)',
      cursor: 'pointer',
      transition: 'opacity var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)',
      opacity: hover ? .85 : 1,
      ...variants[variant],
      ...(hover && (variant === 'outline' || variant === 'ghost') ? {
        background: 'var(--surface-sunken)'
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      minHeight: 'var(--hit-min)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: !!checked,
    disabled: disabled,
    onChange: e => onChange && onChange(e.target.checked),
    style: {
      position: 'absolute',
      opacity: 0,
      width: 1,
      height: 1
    }
  }, rest)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      flex: '0 0 22px',
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-sm)',
      border: '1.5px solid ' + (checked ? 'var(--navy-700)' : 'var(--border-field)'),
      background: checked ? 'var(--navy-700)' : 'transparent',
      opacity: disabled ? .5 : 1,
      transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)'
    }
  }, checked ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 6,
      borderLeft: '2px solid var(--white)',
      borderBottom: '2px solid var(--white)',
      transform: 'rotate(-45deg) translateY(-1px)'
    }
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--size-body-lg)/1.4 var(--font-core)',
      color: 'var(--text-title)'
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  icon,
  style,
  wrapStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const borderColor = error ? 'var(--orange-500)' : focus ? 'var(--border-strong)' : 'var(--border-field)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...wrapStyle
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      font: 'var(--text-style-label)',
      color: 'var(--text-title)',
      marginBottom: 'var(--space-2)'
    }
  }, label) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      height: 48,
      padding: '0 var(--space-4)',
      background: 'var(--surface-card)',
      border: '1.5px solid ' + borderColor,
      borderRadius: 'var(--radius-md)',
      transition: 'border-color var(--dur-fast) var(--ease-standard)'
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'grid',
      placeItems: 'center',
      color: 'var(--grey-500)'
    }
  }, icon) : null, /*#__PURE__*/React.createElement("input", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'var(--weight-regular) var(--size-body-lg)/1.4 var(--font-core)',
      color: 'var(--text-title)',
      padding: 0,
      ...style
    }
  }, rest))), hint || error ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 'var(--space-2)',
      font: 'var(--weight-regular) var(--size-caption)/1.5 var(--font-core)',
      color: error ? 'var(--orange-500)' : 'var(--text-body)'
    }
  }, error || hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  checked,
  onChange,
  label,
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      minHeight: 'var(--hit-min)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": !!checked,
    disabled: disabled,
    onClick: () => onChange && onChange(!checked),
    style: {
      width: 46,
      height: 26,
      padding: 2,
      border: 'none',
      borderRadius: 'var(--radius-pill)',
      background: checked ? 'var(--mint-400)' : 'var(--grey-300)',
      display: 'flex',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      alignItems: 'center',
      cursor: 'inherit',
      opacity: disabled ? .5 : 1,
      transition: 'background var(--dur-base) var(--ease-standard)'
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 'var(--radius-full)',
      background: 'var(--white)',
      boxShadow: 'var(--shadow-press)'
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--size-body-lg)/1.4 var(--font-core)',
      color: 'var(--text-title)'
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* The white card: very rounded, lifted off the indigo ground. A `media` node
   (normally a PatternGrid) sits flush to the top edge; the body gets 16px
   lateral padding. */
function Card({
  media,
  mediaHeight = '50%',
  padded = true,
  elevated = true,
  children,
  style,
  ...rest
}) {
  const h = typeof mediaHeight === 'number' ? mediaHeight + 'px' : mediaHeight;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--surface-card)',
      borderRadius: 'var(--radius-card)',
      boxShadow: elevated ? 'var(--shadow-card)' : 'var(--shadow-none)',
      ...style
    }
  }, rest), media ? /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 ' + h,
      overflow: 'hidden'
    }
  }, media) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      padding: padded ? 'var(--space-5) var(--gutter-card)' : 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// ui_kits/onboarding/OnboardingScreen.jsx
try { (() => {
/* The one screen the source material defines: a full-bleed pattern block over a
   white card, title + body, three-dot indicator, floating close button. */
const {
  Card,
  PatternGrid,
  PageIndicator,
  IconButton
} = window.ModuloDesignSystem_845237;
const STEPS = [{
  title: 'Modular square grid',
  seed: 91,
  body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Massa semper nunc pretium massa, cras iaculis.'
}, {
  title: 'Rotate and repeat',
  seed: 34,
  body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vitae ultrices felis nascetur at, massa cras iaculis.'
}, {
  title: 'Irregular circle Shapes',
  seed: 12,
  body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Massa semper nun pretium massa, cras iaculis, Vitae ultrices felis nascetur at.'
}];
function OnboardingScreen({
  step = 2,
  onStep,
  onClose
}) {
  const s = STEPS[step];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      padding: '18px 12px 16px',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    media: /*#__PURE__*/React.createElement(PatternGrid, {
      columns: 4,
      rows: 5,
      seed: s.seed,
      style: {
        height: '100%'
      }
    }),
    mediaHeight: "58%",
    padded: false,
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-7) var(--gutter-card) 0',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--text-style-title)',
      letterSpacing: 'var(--tracking-tight)',
      color: 'var(--text-title)'
    }
  }, s.title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--text-style-body)',
      color: 'var(--text-body)',
      marginTop: 'var(--space-5)'
    }
  }, s.body)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 var(--gutter-card) var(--space-5)'
    }
  }, /*#__PURE__*/React.createElement(PageIndicator, {
    count: STEPS.length,
    active: step,
    onChange: onStep
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -2,
      left: -2
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    variant: "dark",
    size: "lg",
    label: "Close",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "x",
    style: {
      width: 22,
      height: 22
    }
  })))));
}
Object.assign(window, {
  OnboardingScreen,
  STEPS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/OnboardingScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/onboarding/PhoneFrame.jsx
try { (() => {
/* Android device frame matching the source screenshot: black bezel, rounded
   corners, status bar, gesture pill. Cosmetic only.
   Loaded as a browser Babel script — no imports; globals only. */
function PhoneFrame({
  time = '02:00',
  battery = '63%',
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 360,
      height: 740,
      background: 'var(--black)',
      borderRadius: 38,
      padding: 8,
      boxShadow: 'var(--shadow-card)',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 14px 8px',
      color: 'var(--white)',
      font: 'var(--weight-medium) 12px/1 var(--font-core)'
    }
  }, /*#__PURE__*/React.createElement("span", null, time), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      opacity: .9
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "bluetooth",
    style: {
      width: 12,
      height: 12
    }
  }), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "wifi",
    style: {
      width: 12,
      height: 12
    }
  }), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "battery-full",
    style: {
      width: 14,
      height: 14
    }
  }), /*#__PURE__*/React.createElement("span", null, battery))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 30,
      background: 'var(--surface-app)'
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      placeItems: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 108,
      height: 4,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--white)',
      opacity: .9
    }
  })));
}
Object.assign(window, {
  PhoneFrame
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/onboarding/PhoneFrame.jsx", error: String((e && e.message) || e) }); }

__ds_ns.PageIndicator = __ds_scope.PageIndicator;

__ds_ns.PatternGrid = __ds_scope.PatternGrid;

__ds_ns.SHAPE_KINDS = __ds_scope.SHAPE_KINDS;

__ds_ns.ShapeTile = __ds_scope.ShapeTile;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Card = __ds_scope.Card;

})();
