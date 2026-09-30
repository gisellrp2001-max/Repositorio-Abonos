import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import App from './components/App';
import { SpService } from './services/SpService';
import { OcrService } from './services/OcrService';
import { DEFAULT_MAPPING, parseMapping } from './model';

export interface IGestionAbonosWebPartProps {
  listaAbonos: string;
  listaClientes: string;
  listaHistorial: string;
  biblioteca: string;
  grupoGestion: string;
  ocrUrl: string;
  ocrAppId: string;
  mapeo: string;
}

export default class GestionAbonosWebPart extends BaseClientSideWebPart<IGestionAbonosWebPartProps> {
  private cacheKey = '';
  private sp: SpService | null = null;
  private ocr: OcrService | null = null;
  private mappingError = '';

  private services(): { sp: SpService; ocr: OcrService } {
    const p = this.properties;
    const key = JSON.stringify(p);
    if (!this.sp || !this.ocr || key !== this.cacheKey) {
      const { mapping, error } = parseMapping(p.mapeo);
      this.mappingError = error;
      this.sp = new SpService(this.context, {
        listaAbonos: (p.listaAbonos || 'Abonos').trim(),
        listaClientes: (p.listaClientes || 'Clientes').trim(),
        listaHistorial: (p.listaHistorial || 'Historial Abonos').trim(),
        biblioteca: (p.biblioteca || 'Vouchers').trim(),
        grupoGestion: (p.grupoGestion || 'Gestión de Abonos').trim(),
        ocrUrl: (p.ocrUrl || '').trim(),
        ocrAppId: (p.ocrAppId || '').trim(),
        mapping
      });
      this.ocr = new OcrService(this.context, (p.ocrUrl || '').trim(), (p.ocrAppId || '').trim());
      this.cacheKey = key;
    }
    return { sp: this.sp, ocr: this.ocr };
  }

  public render(): void {
    const { sp, ocr } = this.services();
    const element = React.createElement(App, {
      key: this.cacheKey,
      sp, ocr,
      userName: this.context.pageContext.user.displayName,
      mappingError: this.mappingError
    });
    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected get disableReactivePropertyChanges(): boolean {
    return true;
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [{
        header: { description: 'Configura dónde guarda la app sus datos y cómo se conecta con la lectura automática de vouchers.' },
        groups: [
          {
            groupName: 'Listas de SharePoint',
            groupFields: [
              PropertyPaneTextField('listaAbonos', { label: 'Lista de abonos', placeholder: 'Abonos' }),
              PropertyPaneTextField('listaClientes', { label: 'Lista de clientes', placeholder: 'Clientes' }),
              PropertyPaneTextField('listaHistorial', { label: 'Lista de historial', placeholder: 'Historial Abonos' }),
              PropertyPaneTextField('biblioteca', { label: 'Biblioteca de vouchers', placeholder: 'Vouchers' }),
              PropertyPaneTextField('grupoGestion', { label: 'Grupo de SharePoint de Gestión', placeholder: 'Gestión de Abonos', description: 'Sus miembros (y los administradores del sitio) validan y observan abonos.' })
            ]
          },
          {
            groupName: 'Lectura automática (Azure)',
            groupFields: [
              PropertyPaneTextField('ocrUrl', { label: 'URL de la función', placeholder: 'https://<tu-funcion>.azurewebsites.net/api/leer-voucher' }),
              PropertyPaneTextField('ocrAppId', { label: 'ID de aplicación (Entra ID) de la función', placeholder: 'api://<client-id>', description: 'Déjalo vacío solo si la función no exige inicio de sesión.' })
            ]
          },
          {
            groupName: 'Columnas',
            groupFields: [
              PropertyPaneTextField('mapeo', {
                label: 'Mapeo de columnas (JSON)',
                multiline: true,
                rows: 14,
                placeholder: JSON.stringify(DEFAULT_MAPPING, null, 2),
                description: 'Vacío = nombres por defecto. Indica solo lo que cambia, p. ej. {"abonos":{"importe":"Monto"}}. Revisa el resultado en la sección Configuración de la app.'
              })
            ]
          }
        ]
      }]
    };
  }
}
