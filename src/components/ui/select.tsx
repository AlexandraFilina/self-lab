"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icon";
import { selectKeyboardAction } from "./select-keyboard";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  id,
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (open) listbox.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function openList() {
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Tab") return;
    const result = selectKeyboardAction(
      event.key,
      { open, activeIndex: open ? activeIndex : Math.max(0, selectedIndex) },
      options.length,
    );
    if (!result) return;
    event.preventDefault();
    if (!open && result.state.open) openList();
    else {
      setActiveIndex(result.state.activeIndex);
      setOpen(result.state.open);
    }
    if (result.commit) choose(result.state.activeIndex);
    else if (result.focusTrigger) trigger.current?.focus();
  }

  return (
    <div ref={root} className={`styled-select ${className}`.trim()}>
      <span id={`${id}-label`} className="field-label">
        {label}
      </span>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="styled-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span id={`${id}-value`}>{selected?.label ?? ""}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <ul
          ref={listbox}
          id={`${id}-listbox`}
          className="styled-select-options"
          role="listbox"
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-option-${activeIndex}`}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!root.current?.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-option-${index}`}
              className={`styled-select-option${index === activeIndex ? " is-active" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Icon name="check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
