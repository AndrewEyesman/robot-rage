# Adobe's Director projector under Wine, on a virtual X display, as the reference
# player for comparisons (see docs/reference.md). Nothing Adobe is baked in: the
# projector and game files are mounted at run time.
FROM debian:bookworm
ENV DEBIAN_FRONTEND=noninteractive WINEDEBUG=-all WINEARCH=win32 WINEPREFIX=/wine
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends \
      wine wine32 xvfb xdotool x11-utils imagemagick xauth procps ca-certificates cabextract wget unzip \
      libgl1-mesa-dri:i386 libglx-mesa0:i386 fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
RUN wget -qO /usr/local/bin/winetricks https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks \
 && chmod +x /usr/local/bin/winetricks
RUN useradd -m -u 1000 ref && mkdir /wine && chown ref /wine
USER ref
# Create the 32-bit prefix once at build time so runs start fast, with Microsoft's
# core fonts (Verdana, Arial, ...): the game names Verdana, which every Windows of
# 2004 had, and Wine's substitute changes text layout.
RUN xvfb-run -a wineboot --init && wineserver -w && xvfb-run -a winetricks -q corefonts && wineserver -w
WORKDIR /home/ref
