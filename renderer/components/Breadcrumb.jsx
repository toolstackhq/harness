import React from "react";

export default function Breadcrumb({ items = [] }) {
  return (
    <div className="breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="breadcrumb__sep">›</span>}
            {last ? (
              <span className="breadcrumb__current">{item.label}</span>
            ) : (
              <span className="breadcrumb__link" onClick={item.onClick}>{item.label}</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
