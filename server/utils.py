import sys

def safe_str(val) -> str:
    """
    Safely converts any value (including strings with Unicode characters and exception objects)
    to a pure ASCII representation to prevent UnicodeEncodeError on Windows terminals.
    """
    try:
        if isinstance(val, bytes):
            s = val.decode('utf-8', errors='replace')
        else:
            s = str(val)
        return s.encode('ascii', errors='backslashreplace').decode('ascii')
    except Exception:
        return repr(val)

def safe_print(*args, sep=' ', end='\n', flush=True):
    """
    Prints values to stdout. First tries to write UTF-8 bytes to sys.stdout.buffer
    to support Unicode/Vietnamese without UnicodeEncodeError on Windows.
    Falls back to normal print if buffer is not available.
    """
    try:
        text = sep.join(str(arg) for arg in args) + end
        if hasattr(sys.stdout, 'buffer') and sys.stdout.buffer:
            sys.stdout.buffer.write(text.encode('utf-8'))
            if flush:
                sys.stdout.buffer.flush()
        else:
            sys.stdout.write(text)
            if flush:
                sys.stdout.flush()
    except Exception:
        # Ultimate fallback
        try:
            import builtins
            builtins.print(*args, sep=sep, end=end, flush=flush)
        except Exception:
            pass


