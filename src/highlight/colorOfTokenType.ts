// compatible with prism-react-renderer themes
const theme = {
  plain: {
    color: "#000000",
    backgroundColor: "#ffffff",
    fontFamily: "Monaco, monospace",
    fontSize: "14px",
  },
  styles: [
    {
      types: ["number"],
      style: {
        color: "#116644"
      }
    },
    {
      types: ["string"],
      style: {
        color: "#aa1111"
      }
    },
    {
      types: ["variable", "builtin"],
      style: {
        color: "#268bd2"
      }
    },
    {
      types: ["property", "property-access", "function"],
      style: {
        color: "#b58900"
      }
    },
    {
      types: ["keyword"],
      style: {
        color: "#770088"
      }
    },
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: {
        color: "#009900"
      }
    },
    {
      types: ["namespace"],
      style: {
        opacity: 0.7
      }
    },
    {
      types: ["attr-value"],
      style: {
        color: "#aa1111"
      }
    },
    {
      types: ["punctuation", "operator"],
      style: {
        color: "#000000"
      }
    },
    {
      types: [
        "entity",
        "url",
        "symbol",
        "boolean",
        "constant",
        "regex",
        "inserted"
      ],
      style: {
        color: "#221199"
      }
    },
    {
      types: ["atrule", "attr-name", "selector"],
      style: {
        color: "#00a4db"
      }
    },
    {
      types: ["deleted", "tag"],
      style: {
        color: "#d73a49"
      }
    },
    {
      types: ["function-variable"],
      style: {
        color: "#6f42c1"
      }
    },
    {
      types: ["tag", "selector"],
      style: {
        color: "#00009f"
      }
    },

    // some tags that are not in Prism afaik but are generated by computeJsSpans
    { types: ["default"],
      style: {
        color: "#000000"
      }
    },
    { types: ["definition"],
      style: {
        color: "#0000ff"
      }
    },
    {
      types: ["link"],
      style: {
        color: "#aa1111"
      }
    }
  ]
};

const colorOfTokenType = (type: string) => {
  // reversed to match prism-react-renderer behavior more closely
  const styles = [...theme.styles].reverse();
  for (const style of styles) {
    if (style.types.includes(type))
      return style.style.color ?? theme.plain.color;
  }
  return theme.plain.color;
}

export default colorOfTokenType;
