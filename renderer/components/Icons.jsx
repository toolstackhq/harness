import React from "react";

const I = ({ d, size = 18, fill = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
    <path d={d} />
  </svg>
);

export const Play = (p) => <I {...p} d="M8 5v14l11-7z" />;
export const Stop = (p) => <I {...p} d="M6 6h12v12H6z" />;
export const Clear = (p) => <I {...p} d="M19 13H5v-2h14v2z" />;
export const Code = (p) => <I {...p} d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />;
export const Back = (p) => <I {...p} d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z" />;
export const Forward = (p) => <I {...p} d="M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4L16.2 13H4v-2z" />;
export const Reload = (p) => <I {...p} d="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />;
export const Close = (p) => <I {...p} d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4z" />;
export const Copy = (p) => <I {...p} d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />;
export const Save = (p) => <I {...p} d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM15 9H5V5h10v4z" />;
export const Globe = (p) => <I {...p} d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm-1 17.93A8.001 8.001 0 0 1 4.07 13H7c.1 1.99.76 3.85 1.84 5.4l-.84.53zM7 11H4.07A8.001 8.001 0 0 1 11 4.07v3.86C9.3 8.48 8 9.62 7 11zm6 8.93V16h3.93A8.05 8.05 0 0 1 13 19.93zM13 14v-3h3.93c-.1 1.1-.44 2.15-1 3H13zm0-5V5.07A8.001 8.001 0 0 1 19.93 11H13z" />;
export const Click = (p) => <I {...p} d="m9 3.5 3 6 3-6 1.4 1.4L15 9h4.5l1.4 1.4L16.4 15l4.5 4.5L19.5 21l-4.5-4.5-4.5 4.5-1.4-1.4L13.6 15 9 10.4l1.4-1.4z" />;
export const Type = (p) => <I {...p} d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM5 17h14v-1H5v1zm0-3h14v-1H5v1zm0-3h14V9H5v2zm0-5h14V5H5v1z" />;
export const Check = (p) => <I {...p} d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />;
export const Select = (p) => <I {...p} d="M7 10l5 5 5-5H7z" />;
export const Press = (p) => <I {...p} d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5v-2h10v2H7zm9-3h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" />;
export const Submit = (p) => <I {...p} d="M4 12 2.5 7.5 9 12l-6.5 4.5L4 12zm6 0h12" />;
export const Nav = (p) => <I {...p} d="M12 2 4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />;

export const Logo = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="white" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
  </svg>
);

export const Trash = (p) => <I {...p} d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />;
export const Note = (p) => <I {...p} d="M3 3v18h18V3H3zm15 15H6V6h12v12zM8 8h8v2H8V8zm0 3h8v2H8v-2zm0 3h5v2H8v-2z" />;

export const Spinner = ({ size = 16 }) => (
  <span
    className="spinner"
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
);

export const actionIcon = (kind) => {
  switch (kind) {
    case "click": return Click;
    case "fill": return Type;
    case "check": return Check;
    case "select": return Select;
    case "press": return Press;
    case "submit": return Submit;
    case "navigate": return Nav;
    case "note": return Note;
    default: return Click;
  }
};
