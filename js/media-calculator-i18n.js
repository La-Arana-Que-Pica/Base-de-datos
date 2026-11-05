/* Page-only copy; the site's existing language selector and dictionaries remain in use. */
'use strict';
{
  const copy = {
    es: {
      pageTitle:'Calculadora de medias PES 2018',pageIntro:'Editá los atributos y compará la media en cada posición.',
      toolsLabel:'Herramientas',estimated:'Media PES 2018',attributes:'Atributos',range:'Valores de 40 a 99',
      baseLabel:'Copiar de un jugador',basePlaceholder:'Buscar jugador o equipo…',copyStats:'Copiar estadísticas',
      copiedStats:'Estadísticas copiadas. Ya podés editarlas.',fill:'Rellenar',fillValue:'Valor para rellenar',
      scope:'Atributos que se rellenarán',scopeAll:'Todos',scopeField:'Jugador de campo',scopeKeeper:'Arquero',
      apply:'Aplicar',adjust:'Ajustar todos',clear:'Vaciar',emptyHint:'Completá los 23 atributos para ver las medias.',
      scoreStatus:'{position}: {score} de media.',fillApplied:'Valores aplicados.',cleared:'Atributos vacíos.',
      step:'Ajustar {delta} puntos',skip:'Saltar a la calculadora',baseResults:'Jugadores encontrados',
      toolsHeading:'Edición rápida',noscript:'Activá JavaScript para utilizar la calculadora.'
    },
    en: {
      pageTitle:'PES 2018 overall calculator',pageIntro:'Edit the attributes and compare the overall in every position.',
      toolsLabel:'Tools',estimated:'PES 2018 overall',attributes:'Attributes',range:'Values from 40 to 99',
      baseLabel:'Copy from a player',basePlaceholder:'Search player or team…',copyStats:'Copy stats',
      copiedStats:'Stats copied. You can now edit them.',fill:'Fill',fillValue:'Value to fill',
      scope:'Attributes to fill',scopeAll:'All',scopeField:'Outfield',scopeKeeper:'Goalkeeper',
      apply:'Apply',adjust:'Adjust all',clear:'Clear',emptyHint:'Complete all 23 attributes to see the ratings.',
      scoreStatus:'{position}: {score} overall.',fillApplied:'Values applied.',cleared:'Attributes cleared.',
      step:'Adjust by {delta} points',skip:'Skip to calculator',baseResults:'Players found',
      toolsHeading:'Quick editing',noscript:'Enable JavaScript to use the calculator.'
    },
    pt: {
      pageTitle:'Calculadora de overall PES 2018',pageIntro:'Edite os atributos e compare o overall em cada posição.',
      toolsLabel:'Ferramentas',estimated:'Overall PES 2018',attributes:'Atributos',range:'Valores de 40 a 99',
      baseLabel:'Copiar de um jogador',basePlaceholder:'Buscar jogador ou equipe…',copyStats:'Copiar atributos',
      copiedStats:'Atributos copiados. Agora você pode editá-los.',fill:'Preencher',fillValue:'Valor de preenchimento',
      scope:'Atributos a preencher',scopeAll:'Todos',scopeField:'Jogador de linha',scopeKeeper:'Goleiro',
      apply:'Aplicar',adjust:'Ajustar todos',clear:'Limpar',emptyHint:'Preencha os 23 atributos para ver o overall.',
      scoreStatus:'{position}: overall {score}.',fillApplied:'Valores aplicados.',cleared:'Atributos vazios.',
      step:'Ajustar {delta} pontos',skip:'Ir para a calculadora',baseResults:'Jogadores encontrados',
      toolsHeading:'Edição rápida',noscript:'Ative o JavaScript para usar a calculadora.'
    },
    it: {
      pageTitle:'Calcolatore overall PES 2018',pageIntro:'Modifica gli attributi e confronta l’overall in ogni posizione.',
      toolsLabel:'Strumenti',estimated:'Overall PES 2018',attributes:'Attributi',range:'Valori da 40 a 99',
      baseLabel:'Copia da un giocatore',basePlaceholder:'Cerca giocatore o squadra…',copyStats:'Copia attributi',
      copiedStats:'Attributi copiati. Ora puoi modificarli.',fill:'Compila',fillValue:'Valore da inserire',
      scope:'Attributi da compilare',scopeAll:'Tutti',scopeField:'Giocatore di movimento',scopeKeeper:'Portiere',
      apply:'Applica',adjust:'Modifica tutti',clear:'Svuota',emptyHint:'Completa i 23 attributi per vedere gli overall.',
      scoreStatus:'{position}: overall {score}.',fillApplied:'Valori applicati.',cleared:'Attributi vuoti.',
      step:'Modifica di {delta} punti',skip:'Vai al calcolatore',baseResults:'Giocatori trovati',
      toolsHeading:'Modifica rapida',noscript:'Attiva JavaScript per usare il calcolatore.'
    },

  };
  const extra = {
    es:{metaDescription:'Calculá medias por posición en PES 2018. Editá los 23 atributos o copiá estadísticas de un jugador.',validValue:'Ingresá un número entero entre 40 y 99.',valueRequired:'Ingresá un valor para rellenar.',menu:'Menú',menuOpen:'Abrir menú principal',menuClose:'Cerrar menú principal',mainNav:'Menú principal',legal:'Enlaces legales',terms:'Términos',account:'Cuenta'},
    en:{metaDescription:'Calculate PES 2018 overall ratings by position. Edit 23 attributes or copy stats from a player.',validValue:'Enter a whole number between 40 and 99.',valueRequired:'Enter a value to fill.',menu:'Menu',menuOpen:'Open main menu',menuClose:'Close main menu',mainNav:'Main menu',legal:'Legal links',terms:'Terms',account:'Account'},
    pt:{metaDescription:'Calcule o overall por posição no PES 2018. Edite os 23 atributos ou copie os de um jogador.',validValue:'Digite um número inteiro entre 40 e 99.',valueRequired:'Digite um valor para preencher.',menu:'Menu',menuOpen:'Abrir menu principal',menuClose:'Fechar menu principal',mainNav:'Menu principal',legal:'Links legais',terms:'Termos',account:'Conta'},
    it:{metaDescription:'Calcola l’overall per posizione in PES 2018. Modifica i 23 attributi o copiali da un giocatore.',validValue:'Inserisci un numero intero tra 40 e 99.',valueRequired:'Inserisci un valore da applicare.',menu:'Menu',menuOpen:'Apri menu principale',menuClose:'Chiudi menu principale',mainNav:'Menu principale',legal:'Link legali',terms:'Termini',account:'Account'},
  };
  for (const language of Object.keys(copy)) Object.assign(copy[language],extra[language]);
  for (const [language, messages] of Object.entries(copy)) {
    for (const [key,value] of Object.entries(messages)) I18N_MESSAGES[language][`calculator.${key}`]=value;
  }
}
